/**
 * Provisioning worker — advances a single provision by one state.
 *
 * Each call:
 *  1. Loads the provision row.
 *  2. Validates pre-conditions for the current state.
 *  3. Calls the relevant Mgmt API wrapper.
 *  4. Updates `state` + `state_data` via WHERE state = expected (optimistic
 *     concurrency).
 *  5. Writes an audit row.
 *  6. Returns `{ from, to, data? }`.
 *
 * On error: maps to FAILED_RETRYABLE (with backoff) or FAILED_PERMANENT
 * (4xx OAuth-style) and stops; the worker cron picks up FAILED_RETRYABLE on
 * its next sweep.
 */
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { audit } from "./state-machine";
import {
  applyMigration,
  createProject as createSupabaseProject,
  getProjectKeys,
  pollProjectStatus,
  refreshSupabaseAccessToken,
  SupabaseMgmtError,
  type SupabaseMgmtAuth,
} from "./supabase-mgmt";
import {
  addProjectDomain,
  createProject as createVercelProject,
  pollDeploymentStatus,
  setEnvVars,
  triggerDeployment,
  VercelApiError,
  type VercelAuth,
} from "./vercel-api";
import { listMigrationFiles } from "./migration-runner";
import { decryptVaultToken, encryptVaultToken } from "./token-vault";

// ─── Plan #5 state vocabulary ──────────────────────────────────────────────

export type Plan5State =
  | "NEW"
  | "STRIPE_CHECKOUT_OPEN"
  | "STRIPE_PAID"
  | "AWAITING_SUPABASE_OAUTH"
  | "AWAITING_VERCEL_OAUTH"
  | "SUPABASE_CREATING"
  | "MIGRATIONS_RUNNING"
  | "VERCEL_CREATING"
  | "VERCEL_ENV_SET"
  | "DOMAIN_ATTACHING"
  | "INITIAL_DEPLOY"
  | "READY"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT"
  | "CANCELLED";

export interface ProvisionState5Row {
  id: string;
  state: Plan5State;
  state_data: Record<string, unknown>;
  retry_count: number;
  next_retry_at: string | null;
  google_sub: string;
  email: string;
  display_name: string | null;
  subdomain_short_id: string | null;
  vercel_team_id: string | null;
  stripe_subscription_id: string | null;
}

export interface AdvanceResult {
  id: string;
  from: Plan5State;
  to: Plan5State;
  data?: Record<string, unknown>;
  error?: string;
}

const ORCHESTRATOR_GIT_REPO =
  process.env.HOSTED_PROVISION_GIT_REPO ?? "BenLaurenson/PiggyBack";
const HOSTED_TRACK_BRANCH = process.env.HOSTED_TRACK_BRANCH ?? "release";
const PIGGYBACK_DOMAIN = process.env.HOSTED_DOMAIN ?? "piggyback.finance";

// ─── DB helpers ────────────────────────────────────────────────────────────

export async function getProvision(provisionId: string): Promise<ProvisionState5Row | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("piggyback_provisions")
    .select(
      "id, state, state_data, retry_count, next_retry_at, google_sub, email, display_name, subdomain_short_id, vercel_team_id, stripe_subscription_id"
    )
    .eq("id", provisionId)
    .maybeSingle();
  return (data ?? null) as ProvisionState5Row | null;
}

/**
 * Optimistic concurrency: only update if state still matches `expectedFrom`.
 * Returns true if the row was updated.
 */
export async function transitionWithCAS(
  provisionId: string,
  expectedFrom: Plan5State,
  to: Plan5State,
  patchStateData: Record<string, unknown> = {}
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data: current } = await supabase
    .from("piggyback_provisions")
    .select("state, state_data")
    .eq("id", provisionId)
    .maybeSingle();
  if (!current || (current.state as Plan5State) !== expectedFrom) {
    return false;
  }
  const merged = {
    ...((current.state_data as Record<string, unknown> | null) ?? {}),
    ...patchStateData,
  };
  const { error } = await supabase
    .from("piggyback_provisions")
    .update({
      state: to,
      state_data: merged,
      state_changed_at: new Date().toISOString(),
      // Reset retry counter on successful forward motion.
      retry_count: 0,
      next_retry_at: null,
    })
    .eq("id", provisionId)
    .eq("state", expectedFrom);
  return !error;
}

async function markRetryable(
  provisionId: string,
  fromState: Plan5State,
  reason: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: current } = await supabase
    .from("piggyback_provisions")
    .select("retry_count")
    .eq("id", provisionId)
    .maybeSingle();
  const retryCount = ((current?.retry_count as number | undefined) ?? 0) + 1;
  // Exponential-ish backoff: 5min * retry_count. Capped at 1h.
  const delayMin = Math.min(5 * retryCount, 60);
  const nextRetry = new Date(Date.now() + delayMin * 60_000).toISOString();
  await supabase
    .from("piggyback_provisions")
    .update({
      state: "FAILED_RETRYABLE",
      retry_count: retryCount,
      next_retry_at: nextRetry,
      state_data: {
        last_failure_state: fromState,
        last_failure_reason: reason,
        last_failure_at: new Date().toISOString(),
      },
    })
    .eq("id", provisionId);
  await audit(provisionId, "STATE_FAILED_RETRYABLE", { fromState, reason });
}

async function markPermanent(
  provisionId: string,
  fromState: Plan5State,
  reason: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("piggyback_provisions")
    .update({
      state: "FAILED_PERMANENT",
      state_data: {
        last_failure_state: fromState,
        last_failure_reason: reason,
        last_failure_at: new Date().toISOString(),
      },
    })
    .eq("id", provisionId);
  await audit(provisionId, "STATE_FAILED_PERMANENT", { fromState, reason });
}

function isPermanentError(err: unknown): boolean {
  if (err instanceof SupabaseMgmtError || err instanceof VercelApiError) {
    // 4xx (except 429 rate-limit) is treated as permanent.
    return err.status >= 400 && err.status < 500 && err.status !== 429;
  }
  return false;
}

// ─── OAuth token retrieval ─────────────────────────────────────────────────

async function getDecryptedToken(
  provisionId: string,
  provider: "supabase" | "vercel"
): Promise<{ accessToken: string; refreshToken: string | null; teamId?: string | null } | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("provision_oauth_tokens")
    .select("encrypted_access_token, encrypted_refresh_token, access_token_expires_at")
    .eq("provision_id", provisionId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  return {
    accessToken: decryptVaultToken(data.encrypted_access_token),
    refreshToken: data.encrypted_refresh_token
      ? decryptVaultToken(data.encrypted_refresh_token)
      : null,
  };
}

async function getSupabaseAuthForProvision(
  provisionId: string
): Promise<SupabaseMgmtAuth | null> {
  const tok = await getDecryptedToken(provisionId, "supabase");
  if (!tok) return null;
  return { accessToken: tok.accessToken };
}

async function getVercelAuthForProvision(
  provisionId: string,
  teamId: string | null
): Promise<VercelAuth | null> {
  const tok = await getDecryptedToken(provisionId, "vercel");
  if (!tok) return null;
  return { accessToken: tok.accessToken, teamId: teamId ?? undefined };
}

/**
 * Refresh the Supabase OAuth access token (called on 401). Stores the new
 * access + refresh token in `provision_oauth_tokens` and returns the new
 * access token.
 */
async function refreshSupabaseTokenForProvision(
  provisionId: string
): Promise<string | null> {
  const tok = await getDecryptedToken(provisionId, "supabase");
  if (!tok || !tok.refreshToken) return null;
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const refreshed = await refreshSupabaseAccessToken({
      refreshToken: tok.refreshToken,
      clientId,
      clientSecret,
    });
    const supabase = createServiceRoleClient();
    await supabase
      .from("provision_oauth_tokens")
      .update({
        encrypted_access_token: encryptVaultToken(refreshed.access_token),
        encrypted_refresh_token: encryptVaultToken(refreshed.refresh_token),
        access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("provision_id", provisionId)
      .eq("provider", "supabase");
    return refreshed.access_token;
  } catch {
    return null;
  }
}

// ─── Per-state advance functions ───────────────────────────────────────────

async function advanceStripePaid(p: ProvisionState5Row): Promise<AdvanceResult> {
  // Auto-advance to AWAITING_SUPABASE_OAUTH; the user-facing redirect
  // page will redirect them to Supabase consent.
  const ok = await transitionWithCAS(p.id, "STRIPE_PAID", "AWAITING_SUPABASE_OAUTH");
  if (!ok) return { id: p.id, from: p.state, to: p.state };
  await audit(p.id, "STATE_AWAITING_SUPABASE_OAUTH");
  return { id: p.id, from: "STRIPE_PAID", to: "AWAITING_SUPABASE_OAUTH" };
}

async function advanceSupabaseCreating(p: ProvisionState5Row): Promise<AdvanceResult> {
  const auth = await getSupabaseAuthForProvision(p.id);
  if (!auth) {
    await markPermanent(p.id, "SUPABASE_CREATING", "no Supabase OAuth token");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT", error: "no token" };
  }

  const stateData = p.state_data ?? {};
  let projectRef = stateData.supabase_project_ref as string | undefined;
  let dbPass = stateData.supabase_db_pass as string | undefined;
  let orgId = stateData.supabase_org_id as string | undefined;

  // First pass: create the project.
  if (!projectRef) {
    if (!orgId) {
      await markPermanent(
        p.id,
        "SUPABASE_CREATING",
        "missing supabase_org_id in state_data"
      );
      return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
    }
    if (!dbPass) {
      dbPass = randomBytes(24).toString("hex");
    }
    try {
      const project = await createSupabaseProject(auth, {
        organizationId: orgId,
        name: `piggyback-${p.subdomain_short_id ?? p.id.slice(0, 8)}`,
        dbPass,
        idempotencyKey: `provision-${p.id}-supabase-create`,
      });
      projectRef = project.ref;
      // Persist ref + dbPass so a retry doesn't try to recreate.
      const supabase = createServiceRoleClient();
      await supabase
        .from("piggyback_provisions")
        .update({
          supabase_project_ref: projectRef,
          state_data: {
            ...stateData,
            supabase_project_ref: projectRef,
            supabase_db_pass: dbPass,
            supabase_org_id: orgId,
          },
        })
        .eq("id", p.id);
      await audit(p.id, "SUPABASE_PROJECT_CREATED", { ref: projectRef });
    } catch (err) {
      if (isPermanentError(err)) {
        await markPermanent(p.id, "SUPABASE_CREATING", String(err));
        return { id: p.id, from: p.state, to: "FAILED_PERMANENT", error: String(err) };
      }
      await markRetryable(p.id, "SUPABASE_CREATING", String(err));
      return { id: p.id, from: p.state, to: "FAILED_RETRYABLE", error: String(err) };
    }
  }

  // Wait for ACTIVE_HEALTHY (short timeout — worker resumes on next sweep).
  try {
    const status = await pollProjectStatus(auth, projectRef!, {
      intervalMs: 5_000,
      timeoutMs: 60_000,
    });
    if (status !== "ACTIVE_HEALTHY") {
      await markRetryable(p.id, "SUPABASE_CREATING", `status=${status}`);
      return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
    }
  } catch (err) {
    if (isPermanentError(err)) {
      await markPermanent(p.id, "SUPABASE_CREATING", String(err));
      return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
    }
    await markRetryable(p.id, "SUPABASE_CREATING", String(err));
    return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
  }

  // Read keys + advance.
  let keys;
  try {
    keys = await getProjectKeys(auth, projectRef!);
  } catch (err) {
    await markRetryable(p.id, "SUPABASE_CREATING", `getProjectKeys: ${String(err)}`);
    return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
  }

  const ok = await transitionWithCAS(p.id, "SUPABASE_CREATING", "MIGRATIONS_RUNNING", {
    supabase_project_ref: projectRef,
    supabase_url: keys.url,
    supabase_anon_key: keys.anonKey,
    supabase_service_role_key: keys.serviceRoleKey,
  });
  if (!ok) return { id: p.id, from: p.state, to: p.state };
  await audit(p.id, "STATE_MIGRATIONS_RUNNING", { ref: projectRef });
  return {
    id: p.id,
    from: "SUPABASE_CREATING",
    to: "MIGRATIONS_RUNNING",
    data: { supabase_project_ref: projectRef },
  };
}

async function advanceMigrationsRunning(p: ProvisionState5Row): Promise<AdvanceResult> {
  const auth = await getSupabaseAuthForProvision(p.id);
  if (!auth) {
    await markPermanent(p.id, "MIGRATIONS_RUNNING", "no Supabase OAuth token");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }
  const projectRef = (p.state_data?.supabase_project_ref as string | undefined) ?? "";
  if (!projectRef) {
    await markPermanent(p.id, "MIGRATIONS_RUNNING", "no project ref in state_data");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }

  const alreadyApplied = (p.state_data?.applied_migrations as string[] | undefined) ?? [];
  const files = listMigrationFiles();
  const remaining = files.filter((f) => !alreadyApplied.includes(f));
  const newlyApplied: string[] = [...alreadyApplied];

  for (const file of remaining) {
    const fs = await import("fs");
    const path = await import("path");
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations", file),
      "utf-8"
    );
    try {
      await applyMigration(auth, projectRef, sql, file);
      newlyApplied.push(file);
    } catch (err) {
      // Persist progress so far + fail.
      const supabase = createServiceRoleClient();
      await supabase
        .from("piggyback_provisions")
        .update({
          state_data: {
            ...p.state_data,
            applied_migrations: newlyApplied,
            last_failed_migration: file,
          },
        })
        .eq("id", p.id);
      if (isPermanentError(err)) {
        await markPermanent(p.id, "MIGRATIONS_RUNNING", `${file}: ${String(err)}`);
        return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
      }
      await markRetryable(p.id, "MIGRATIONS_RUNNING", `${file}: ${String(err)}`);
      return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
    }
  }

  const ok = await transitionWithCAS(p.id, "MIGRATIONS_RUNNING", "VERCEL_CREATING", {
    applied_migrations: newlyApplied,
  });
  if (!ok) return { id: p.id, from: p.state, to: p.state };
  await audit(p.id, "STATE_VERCEL_CREATING", { applied: newlyApplied.length });
  return {
    id: p.id,
    from: "MIGRATIONS_RUNNING",
    to: "VERCEL_CREATING",
    data: { applied: newlyApplied.length },
  };
}

async function advanceVercelCreating(p: ProvisionState5Row): Promise<AdvanceResult> {
  const auth = await getVercelAuthForProvision(p.id, p.vercel_team_id);
  if (!auth) {
    await markPermanent(p.id, "VERCEL_CREATING", "no Vercel OAuth token");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }

  const stateData = p.state_data ?? {};
  let vercelProjectId = stateData.vercel_project_id as string | undefined;

  if (!vercelProjectId) {
    try {
      const project = await createVercelProject(auth, {
        name: `piggyback-${p.subdomain_short_id ?? p.id.slice(0, 8)}`,
        gitRepo: ORCHESTRATOR_GIT_REPO,
        branch: HOSTED_TRACK_BRANCH,
        idempotencyKey: `provision-${p.id}-vercel-create`,
      });
      vercelProjectId = project.id;
      const supabase = createServiceRoleClient();
      await supabase
        .from("piggyback_provisions")
        .update({
          vercel_project_id: vercelProjectId,
          state_data: { ...stateData, vercel_project_id: vercelProjectId },
        })
        .eq("id", p.id);
      await audit(p.id, "VERCEL_PROJECT_CREATED", { id: vercelProjectId });
    } catch (err) {
      if (isPermanentError(err)) {
        await markPermanent(p.id, "VERCEL_CREATING", String(err));
        return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
      }
      await markRetryable(p.id, "VERCEL_CREATING", String(err));
      return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
    }
  }

  const ok = await transitionWithCAS(p.id, "VERCEL_CREATING", "VERCEL_ENV_SET", {
    vercel_project_id: vercelProjectId,
  });
  if (!ok) return { id: p.id, from: p.state, to: p.state };
  await audit(p.id, "STATE_VERCEL_ENV_SET");
  return { id: p.id, from: "VERCEL_CREATING", to: "VERCEL_ENV_SET" };
}

/** Build the env-var array for a tenant deploy (per the spec). */
export function buildTenantEnvVars(args: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  upApiEncryptionKey: string;
  provisionerEncryptionKey: string;
  appUrl: string;
  cronSecret: string;
  adminEmail: string;
}): Array<{ key: string; value: string }> {
  return [
    { key: "NEXT_PUBLIC_SUPABASE_URL", value: args.supabaseUrl },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: args.supabaseAnonKey },
    { key: "SUPABASE_SERVICE_ROLE_KEY", value: args.supabaseServiceRoleKey },
    { key: "UP_API_ENCRYPTION_KEY", value: args.upApiEncryptionKey },
    { key: "PROVISIONER_ENCRYPTION_KEY", value: args.provisionerEncryptionKey },
    { key: "NEXT_PUBLIC_APP_URL", value: args.appUrl },
    { key: "CRON_SECRET", value: args.cronSecret },
    { key: "ADMIN_EMAILS", value: args.adminEmail },
    {
      key: "RESEND_API_KEY",
      value: process.env.RESEND_API_KEY ?? "",
    },
    {
      key: "RESEND_FROM",
      value: process.env.RESEND_FROM ?? `hello@${PIGGYBACK_DOMAIN}`,
    },
    { key: "NEXT_PUBLIC_HOSTED_ENABLED", value: "" }, // ⚠ tenants are NOT orchestrator
  ];
}

async function advanceVercelEnvSet(p: ProvisionState5Row): Promise<AdvanceResult> {
  const auth = await getVercelAuthForProvision(p.id, p.vercel_team_id);
  if (!auth) {
    await markPermanent(p.id, "VERCEL_ENV_SET", "no Vercel OAuth token");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }
  const stateData = p.state_data ?? {};
  const projectId = stateData.vercel_project_id as string | undefined;
  if (!projectId) {
    await markPermanent(p.id, "VERCEL_ENV_SET", "missing vercel_project_id");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }

  const supabaseUrl = stateData.supabase_url as string | undefined;
  const supabaseAnonKey = stateData.supabase_anon_key as string | undefined;
  const supabaseServiceRoleKey = stateData.supabase_service_role_key as string | undefined;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    await markPermanent(p.id, "VERCEL_ENV_SET", "missing supabase keys in state_data");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }

  const upApiKey =
    (stateData.up_api_encryption_key as string | undefined) ??
    randomBytes(32).toString("hex");
  const provKey =
    (stateData.provisioner_encryption_key as string | undefined) ??
    randomBytes(32).toString("hex");
  const cronSecret =
    (stateData.cron_secret as string | undefined) ?? randomBytes(32).toString("hex");

  const subdomain = p.subdomain_short_id ?? p.id.slice(0, 8);
  const appUrl = `https://${subdomain}.${PIGGYBACK_DOMAIN}`;

  const vars = buildTenantEnvVars({
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    upApiEncryptionKey: upApiKey,
    provisionerEncryptionKey: provKey,
    appUrl,
    cronSecret,
    adminEmail: p.email,
  });

  try {
    await setEnvVars(auth, projectId, vars);
  } catch (err) {
    if (isPermanentError(err)) {
      await markPermanent(p.id, "VERCEL_ENV_SET", String(err));
      return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
    }
    await markRetryable(p.id, "VERCEL_ENV_SET", String(err));
    return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
  }

  const ok = await transitionWithCAS(p.id, "VERCEL_ENV_SET", "DOMAIN_ATTACHING", {
    up_api_encryption_key_set: true,
    provisioner_encryption_key_set: true,
    cron_secret_set: true,
    app_url: appUrl,
  });
  if (!ok) return { id: p.id, from: p.state, to: p.state };
  await audit(p.id, "STATE_DOMAIN_ATTACHING");
  return { id: p.id, from: "VERCEL_ENV_SET", to: "DOMAIN_ATTACHING" };
}

async function advanceDomainAttaching(p: ProvisionState5Row): Promise<AdvanceResult> {
  const auth = await getVercelAuthForProvision(p.id, p.vercel_team_id);
  if (!auth) {
    await markPermanent(p.id, "DOMAIN_ATTACHING", "no Vercel OAuth token");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }
  const projectId = p.state_data?.vercel_project_id as string | undefined;
  if (!projectId || !p.subdomain_short_id) {
    await markPermanent(p.id, "DOMAIN_ATTACHING", "missing project_id or subdomain");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }

  const domain = `${p.subdomain_short_id}.${PIGGYBACK_DOMAIN}`;
  try {
    await addProjectDomain(auth, projectId, domain);
  } catch (err) {
    // Domain-already-attached counts as success (idempotent).
    if (err instanceof VercelApiError && err.status === 409) {
      // continue
    } else if (isPermanentError(err)) {
      await markPermanent(p.id, "DOMAIN_ATTACHING", String(err));
      return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
    } else {
      await markRetryable(p.id, "DOMAIN_ATTACHING", String(err));
      return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
    }
  }

  const ok = await transitionWithCAS(p.id, "DOMAIN_ATTACHING", "INITIAL_DEPLOY", {
    domain_attached: domain,
  });
  if (!ok) return { id: p.id, from: p.state, to: p.state };
  await audit(p.id, "STATE_INITIAL_DEPLOY", { domain });
  return { id: p.id, from: "DOMAIN_ATTACHING", to: "INITIAL_DEPLOY" };
}

async function advanceInitialDeploy(p: ProvisionState5Row): Promise<AdvanceResult> {
  const auth = await getVercelAuthForProvision(p.id, p.vercel_team_id);
  if (!auth) {
    await markPermanent(p.id, "INITIAL_DEPLOY", "no Vercel OAuth token");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }
  const projectId = p.state_data?.vercel_project_id as string | undefined;
  if (!projectId) {
    await markPermanent(p.id, "INITIAL_DEPLOY", "missing vercel_project_id");
    return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
  }
  let deploymentId = p.state_data?.deployment_id as string | undefined;

  if (!deploymentId) {
    try {
      const dep = await triggerDeployment(auth, {
        projectId,
        name: `piggyback-${p.subdomain_short_id ?? p.id.slice(0, 8)}`,
        gitBranch: HOSTED_TRACK_BRANCH,
        idempotencyKey: `provision-${p.id}-deploy-initial`,
      });
      deploymentId = dep.uid;
      const supabase = createServiceRoleClient();
      await supabase
        .from("piggyback_provisions")
        .update({
          vercel_deployment_url: dep.url,
          state_data: { ...p.state_data, deployment_id: deploymentId, deployment_url: dep.url },
        })
        .eq("id", p.id);
      await audit(p.id, "DEPLOYMENT_TRIGGERED", { id: deploymentId });
    } catch (err) {
      if (isPermanentError(err)) {
        await markPermanent(p.id, "INITIAL_DEPLOY", String(err));
        return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
      }
      await markRetryable(p.id, "INITIAL_DEPLOY", String(err));
      return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
    }
  }

  // Poll for terminal state, short timeout — let worker resume.
  try {
    const dep = await pollDeploymentStatus(auth, deploymentId!, {
      intervalMs: 10_000,
      timeoutMs: 60_000,
    });
    if (dep.state === "READY") {
      const ok = await transitionWithCAS(p.id, "INITIAL_DEPLOY", "READY", {
        deployment_state: "READY",
      });
      if (!ok) return { id: p.id, from: p.state, to: p.state };
      await audit(p.id, "STATE_READY", { deployment_url: dep.url });
      // Hook into existing welcome-email flow on legacy state-machine.
      try {
        const { transitionState } = await import("./state-machine");
        // The legacy table column is the same — calling transitionState with READY
        // triggers welcomeEmail. Wrapped in try/catch so the worker doesn't blow up.
        await transitionState(p.id, "READY", "Initial deploy complete").catch(() => undefined);
      } catch {
        // ignore
      }
      return { id: p.id, from: "INITIAL_DEPLOY", to: "READY", data: { deployment_url: dep.url } };
    }
    if (dep.state === "ERROR" || dep.state === "CANCELED") {
      await markRetryable(p.id, "INITIAL_DEPLOY", `deployment ${dep.state}`);
      return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
    }
    // Still building — release; worker comes back.
    return { id: p.id, from: p.state, to: p.state };
  } catch (err) {
    if (isPermanentError(err)) {
      await markPermanent(p.id, "INITIAL_DEPLOY", String(err));
      return { id: p.id, from: p.state, to: "FAILED_PERMANENT" };
    }
    await markRetryable(p.id, "INITIAL_DEPLOY", String(err));
    return { id: p.id, from: p.state, to: "FAILED_RETRYABLE" };
  }
}

async function advanceFailedRetryable(p: ProvisionState5Row): Promise<AdvanceResult> {
  // Resume from the state we failed in.
  const last = p.state_data?.last_failure_state as Plan5State | undefined;
  if (!last) {
    return { id: p.id, from: p.state, to: p.state };
  }
  // Restore state + retry.
  const ok = await transitionWithCAS(p.id, "FAILED_RETRYABLE", last);
  if (!ok) return { id: p.id, from: p.state, to: p.state };
  await audit(p.id, `STATE_${last}_RESUMED`);
  // Recurse into the resumed state with a fresh row read.
  const fresh = await getProvision(p.id);
  if (!fresh) return { id: p.id, from: p.state, to: p.state };
  return advanceProvisionForRow(fresh);
}

// ─── Public dispatcher ────────────────────────────────────────────────────

async function advanceProvisionForRow(p: ProvisionState5Row): Promise<AdvanceResult> {
  switch (p.state) {
    case "STRIPE_PAID":
      return advanceStripePaid(p);
    case "SUPABASE_CREATING":
      return advanceSupabaseCreating(p);
    case "MIGRATIONS_RUNNING":
      return advanceMigrationsRunning(p);
    case "VERCEL_CREATING":
      return advanceVercelCreating(p);
    case "VERCEL_ENV_SET":
      return advanceVercelEnvSet(p);
    case "DOMAIN_ATTACHING":
      return advanceDomainAttaching(p);
    case "INITIAL_DEPLOY":
      return advanceInitialDeploy(p);
    case "FAILED_RETRYABLE":
      return advanceFailedRetryable(p);
    default:
      // Terminal or user-driven — no-op.
      return { id: p.id, from: p.state, to: p.state };
  }
}

export async function advanceProvision(provisionId: string): Promise<AdvanceResult> {
  const p = await getProvision(provisionId);
  if (!p) throw new Error(`Provision ${provisionId} not found`);
  return advanceProvisionForRow(p);
}

// Re-export for tests.
export {
  refreshSupabaseTokenForProvision as _refreshSupabaseTokenForProvision,
};
