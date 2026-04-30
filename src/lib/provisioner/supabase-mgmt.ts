/**
 * Supabase Management API client (provisioner-side).
 *
 * @see https://api.supabase.com/api/v1 — Supabase Management API
 *
 * Used to:
 *   - List the user's organizations after OAuth.
 *   - Create a new project in the user's org (Sydney region).
 *   - Run schema migrations against the new project via the SQL endpoint.
 *   - Read the project's URL + keys for env-var population on Vercel.
 *
 * Authentication: OAuth bearer token from /v1/oauth/token (refresh-token flow).
 */

const BASE = "https://api.supabase.com";

export interface SupabaseMgmtAuth {
  /** Decrypted access token. Caller is responsible for refresh handling. */
  accessToken: string;
}

export interface SupabaseOrganization {
  id: string;
  name: string;
  slug?: string;
}

export interface SupabaseProject {
  id: string;
  ref: string;
  name: string;
  region: string;
  status:
    | "INACTIVE"
    | "ACTIVE_HEALTHY"
    | "ACTIVE_UNHEALTHY"
    | "COMING_UP"
    | "GOING_DOWN"
    | "INIT_FAILED"
    | "REMOVED"
    | "RESTORING"
    | "UNKNOWN"
    | "UPGRADING"
    | "PAUSING";
  created_at: string;
  organization_id?: string;
  database?: { host: string; version: string };
}

export interface SupabaseProjectKeys {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export class SupabaseMgmtError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SupabaseMgmtError";
    this.status = status;
  }
}

async function mgmtRequest<T>(
  auth: SupabaseMgmtAuth,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const json = await response.json();
      detail = JSON.stringify(json);
    } catch {
      detail = await response.text();
    }
    throw new SupabaseMgmtError(
      `Supabase Management API ${response.status} on ${path}: ${detail}`,
      response.status
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function listOrganizations(auth: SupabaseMgmtAuth): Promise<SupabaseOrganization[]> {
  return mgmtRequest<SupabaseOrganization[]>(auth, "/v1/organizations");
}

export async function listProjects(auth: SupabaseMgmtAuth): Promise<SupabaseProject[]> {
  return mgmtRequest<SupabaseProject[]>(auth, "/v1/projects");
}

export async function getProject(
  auth: SupabaseMgmtAuth,
  ref: string
): Promise<SupabaseProject> {
  return mgmtRequest<SupabaseProject>(auth, `/v1/projects/${encodeURIComponent(ref)}`);
}

export async function createProject(
  auth: SupabaseMgmtAuth,
  input: {
    organizationId: string;
    name: string;
    /** Database password — generate via crypto.randomBytes for new projects. */
    dbPass: string;
    /** Default to ap-southeast-2 (Sydney) for AU residency. */
    region?: string;
    /** "free", "pro", "team", "enterprise". Defaults to free. */
    plan?: "free" | "pro" | "team" | "enterprise";
  }
): Promise<SupabaseProject> {
  return mgmtRequest<SupabaseProject>(auth, "/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      organization_id: input.organizationId,
      name: input.name,
      db_pass: input.dbPass,
      region: input.region ?? "ap-southeast-2",
      plan: input.plan ?? "free",
    }),
  });
}

/**
 * Run a SQL statement against the project. Used to apply migration files.
 * The Mgmt API exposes /v1/projects/{ref}/database/query.
 */
export async function runSql(
  auth: SupabaseMgmtAuth,
  ref: string,
  query: string
): Promise<unknown[]> {
  const result = await mgmtRequest<{ result?: unknown[] } | unknown[]>(
    auth,
    `/v1/projects/${encodeURIComponent(ref)}/database/query`,
    {
      method: "POST",
      body: JSON.stringify({ query }),
    }
  );
  if (Array.isArray(result)) return result;
  return result?.result ?? [];
}

/**
 * Fetch the project's anon + service role keys via the Mgmt API.
 * @see https://supabase.com/docs/reference/api/v1-get-project-api-keys
 */
export async function getProjectKeys(
  auth: SupabaseMgmtAuth,
  ref: string
): Promise<SupabaseProjectKeys> {
  const keys = await mgmtRequest<Array<{ name: string; api_key: string }>>(
    auth,
    `/v1/projects/${encodeURIComponent(ref)}/api-keys`
  );
  const anonKey = keys.find((k) => k.name === "anon")?.api_key;
  const serviceRoleKey = keys.find((k) => k.name === "service_role")?.api_key;
  if (!anonKey || !serviceRoleKey) {
    throw new SupabaseMgmtError("Project did not return both anon and service_role keys", 500);
  }
  return {
    url: `https://${ref}.supabase.co`,
    anonKey,
    serviceRoleKey,
  };
}

/**
 * Poll until the project is ACTIVE_HEALTHY, with timeout. Returns the final
 * status. Used after createProject — Supabase takes ~30-90s to provision.
 */
export async function waitForProjectHealthy(
  auth: SupabaseMgmtAuth,
  ref: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<SupabaseProject> {
  const interval = options.intervalMs ?? 5000;
  const timeout = options.timeoutMs ?? 5 * 60_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const project = await getProject(auth, ref);
    if (project.status === "ACTIVE_HEALTHY") return project;
    if (project.status === "INIT_FAILED") {
      throw new SupabaseMgmtError(`Project ${ref} failed to initialize`, 500);
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new SupabaseMgmtError(`Project ${ref} did not become healthy within ${timeout}ms`, 504);
}

// ─── OAuth token exchange ───────────────────────────────────────────────────

export interface SupabaseOAuthExchangeResult {
  access_token: string;
  refresh_token: string;
  /** Seconds until expiry. */
  expires_in: number;
  token_type: "Bearer";
}

/**
 * Exchange an authorization code for an access token after the user redirects
 * back from Supabase's OAuth consent screen.
 */
export async function exchangeSupabaseAuthCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<SupabaseOAuthExchangeResult> {
  const response = await fetch("https://api.supabase.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new SupabaseMgmtError(`Supabase OAuth token exchange failed: ${text}`, response.status);
  }
  return response.json() as Promise<SupabaseOAuthExchangeResult>;
}

/** Refresh an expired access token. */
export async function refreshSupabaseAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<SupabaseOAuthExchangeResult> {
  const response = await fetch("https://api.supabase.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new SupabaseMgmtError(`Supabase OAuth refresh failed: ${text}`, response.status);
  }
  return response.json() as Promise<SupabaseOAuthExchangeResult>;
}
