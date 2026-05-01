/**
 * Vercel REST API client (provisioner-side).
 *
 * @see https://vercel.com/docs/rest-api
 *
 * Used to:
 *   - Create a project in the user's Vercel team linked to the PiggyBack repo.
 *   - Set environment variables (Up token, Supabase keys, etc.).
 *   - Trigger the initial deployment.
 *   - Attach {shortid}.piggyback.finance as a custom domain on the deployment.
 *   - List recent deployments and tail logs (for admin tooling).
 */

import { incrementResourceUsage } from "./resource-usage";

const BASE = "https://api.vercel.com";

function isDryRun(): boolean {
  return process.env.PROVISIONER_DRY_RUN === "true";
}

export interface VercelAuth {
  /** Decrypted access token (from the Vercel OAuth integration flow). */
  accessToken: string;
  /** The configuration ID returned by Vercel during integration install. */
  configurationId?: string;
  /** Optional team ID. If set, requests are scoped to that team. */
  teamId?: string;
}

export class VercelApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "VercelApiError";
    this.status = status;
    this.code = code;
  }
}

async function vercelRequest<T>(
  auth: VercelAuth,
  path: string,
  init: RequestInit = {},
  options: { idempotencyKey?: string } = {}
): Promise<T> {
  await incrementResourceUsage("vercel");

  const url = new URL(BASE + path);
  if (auth.teamId) {
    url.searchParams.set("teamId", auth.teamId);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...((init.headers ?? {}) as Record<string, string>),
  };
  if (options.idempotencyKey) {
    headers["x-vercel-idempotency-key"] = options.idempotencyKey;
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = "";
    let code: string | undefined;
    try {
      const json = (await response.json()) as { error?: { message?: string; code?: string } };
      detail = json?.error?.message ?? JSON.stringify(json);
      code = json?.error?.code;
    } catch {
      detail = await response.text();
    }
    throw new VercelApiError(
      `Vercel API ${response.status} on ${path}: ${detail}`,
      response.status,
      code
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  framework?: string | null;
  createdAt: number;
  link?: { type: string; repo: string; org?: string };
}

export async function createProject(
  auth: VercelAuth,
  input: {
    name: string;
    /** "github" repo slug, e.g. "BenLaurenson/PiggyBack". */
    gitRepo: string;
    /** Branch we track for hosted deployments. */
    branch?: string;
    /** Idempotency key (e.g. `provision-{id}-vercel-create`). */
    idempotencyKey?: string;
  }
): Promise<VercelProject> {
  if (isDryRun()) {
    return {
      id: "dry-vercel-project",
      name: input.name,
      accountId: "dry-account",
      framework: "nextjs",
      createdAt: Date.now(),
      link: { type: "github", repo: input.gitRepo },
    };
  }
  return vercelRequest<VercelProject>(
    auth,
    "/v11/projects",
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        framework: "nextjs",
        gitRepository: {
          type: "github",
          repo: input.gitRepo,
        },
        ...(input.branch ? { gitProductionBranch: input.branch } : {}),
      }),
    },
    { idempotencyKey: input.idempotencyKey }
  );
}

export async function getProject(auth: VercelAuth, projectId: string): Promise<VercelProject> {
  return vercelRequest<VercelProject>(auth, `/v9/projects/${encodeURIComponent(projectId)}`);
}

export async function deleteProject(auth: VercelAuth, projectId: string): Promise<void> {
  await vercelRequest(auth, `/v9/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
}

// ─── Environment variables ───────────────────────────────────────────────────

export type VercelEnvTarget = "production" | "preview" | "development";

export async function setEnvVars(
  auth: VercelAuth,
  projectId: string,
  vars: Array<{ key: string; value: string; type?: "plain" | "encrypted"; targets?: VercelEnvTarget[] }>
): Promise<void> {
  if (isDryRun()) return;
  // Vercel's bulk-create endpoint takes an array.
  await vercelRequest(auth, `/v10/projects/${encodeURIComponent(projectId)}/env`, {
    method: "POST",
    body: JSON.stringify(
      vars.map((v) => ({
        key: v.key,
        value: v.value,
        type: v.type ?? "encrypted",
        target: v.targets ?? ["production", "preview", "development"],
      }))
    ),
  });
}

// ─── Deployments ─────────────────────────────────────────────────────────────

export interface VercelDeployment {
  uid: string;
  url: string;
  state: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
  readyState?: string;
  createdAt: number;
}

/** Trigger a fresh deployment of the project's tracked branch. */
export async function triggerDeployment(
  auth: VercelAuth,
  input: {
    projectId: string;
    gitRepoId?: number;
    gitBranch?: string;
    name?: string;
    idempotencyKey?: string;
  }
): Promise<VercelDeployment> {
  if (isDryRun()) {
    return {
      uid: "dry-deployment",
      url: `${input.name ?? "dry"}-dryrun.vercel.app`,
      state: "QUEUED",
      createdAt: Date.now(),
    };
  }
  return vercelRequest<VercelDeployment>(
    auth,
    "/v13/deployments",
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        project: input.projectId,
        target: "production",
        gitSource: {
          type: "github",
          ref: input.gitBranch ?? "release",
          repoId: input.gitRepoId,
        },
      }),
    },
    { idempotencyKey: input.idempotencyKey }
  );
}

/**
 * Poll deployment status until READY / ERROR / CANCELED, or timeout.
 * Plan #5 spec: poll every 10s up to 5min.
 */
export async function pollDeploymentStatus(
  auth: VercelAuth,
  deploymentId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<VercelDeployment> {
  if (isDryRun()) {
    return {
      uid: deploymentId,
      url: "dry-run.vercel.app",
      state: "READY",
      createdAt: Date.now(),
    };
  }
  const interval = options.intervalMs ?? 10_000;
  const timeout = options.timeoutMs ?? 5 * 60_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const dep = await vercelRequest<VercelDeployment>(
      auth,
      `/v13/deployments/${encodeURIComponent(deploymentId)}`
    );
    if (dep.state === "READY" || dep.state === "ERROR" || dep.state === "CANCELED") {
      return dep;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new VercelApiError(
    `Deployment ${deploymentId} did not reach a terminal state within ${timeout}ms`,
    504
  );
}

export async function listDeployments(
  auth: VercelAuth,
  projectId: string,
  limit = 10
): Promise<VercelDeployment[]> {
  const data = await vercelRequest<{ deployments: VercelDeployment[] }>(
    auth,
    `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`
  );
  return data.deployments;
}

// ─── Domains ─────────────────────────────────────────────────────────────────

export interface VercelDomain {
  name: string;
  apexName?: string;
  verified: boolean;
}

/**
 * Attach a custom domain to a project. The provisioner-team must already own
 * piggyback.finance verified, so attaching subdomains works by API alone.
 */
export async function addProjectDomain(
  auth: VercelAuth,
  projectId: string,
  domain: string
): Promise<VercelDomain> {
  if (isDryRun()) {
    return { name: domain, verified: true };
  }
  return vercelRequest<VercelDomain>(
    auth,
    `/v10/projects/${encodeURIComponent(projectId)}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    },
    { idempotencyKey: `domain-${projectId}-${domain}` }
  );
}

export async function removeProjectDomain(
  auth: VercelAuth,
  projectId: string,
  domain: string
): Promise<void> {
  if (isDryRun()) return;
  await vercelRequest(
    auth,
    `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" }
  );
}

// ─── OAuth token exchange ────────────────────────────────────────────────────

export interface VercelOAuthExchangeResult {
  token_type: "Bearer";
  access_token: string;
  installation_id?: string;
  user_id?: string;
  team_id?: string;
}

export async function exchangeVercelAuthCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<VercelOAuthExchangeResult> {
  const response = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new VercelApiError(`Vercel OAuth token exchange failed: ${text}`, response.status);
  }
  return response.json() as Promise<VercelOAuthExchangeResult>;
}
