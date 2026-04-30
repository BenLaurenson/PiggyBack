/**
 * Drive the provisioning state machine forward.
 *
 * Called repeatedly from the /get-started UI (or an admin "redrive" button).
 * Each call advances one step if the prereqs are in place; otherwise it's a no-op.
 *
 * State transitions performed here:
 *
 *   SUPABASE_AUTHED → SUPABASE_PROVISIONED
 *     Create a project in the user's Supabase org, region ap-southeast-2.
 *     Wait for ACTIVE_HEALTHY (max 5min).
 *
 *   SUPABASE_PROVISIONED → MIGRATIONS_RUN
 *     Apply the bundled migration SQL files to the new project.
 *
 *   VERCEL_AUTHED + MIGRATIONS_RUN → VERCEL_PROVISIONED
 *     Create a Vercel project linked to BenLaurenson/PiggyBack on the release branch.
 *
 *   VERCEL_PROVISIONED → ENV_VARS_SET
 *     Push Supabase URL / keys / encryption key onto Vercel project env.
 *
 *   ENV_VARS_SET → DOMAIN_ATTACHED
 *     Attach {shortid}.piggyback.finance via Vercel API.
 *
 * Returns the new state. Does NOT block on Up Bank PAT — that's gated on the
 * user pasting it inside their fresh deployment, which is a separate event.
 */

import { NextResponse, type NextRequest } from "next/server";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import {
  audit,
  getProvisionById,
  readOAuthToken,
  transitionState,
} from "@/lib/provisioner/state-machine";
import {
  createProject as createSupabaseProject,
  getProjectKeys,
  listOrganizations,
  runSql,
  waitForProjectHealthy,
} from "@/lib/provisioner/supabase-mgmt";
import {
  addProjectDomain,
  createProject as createVercelProject,
  setEnvVars,
  triggerDeployment,
} from "@/lib/provisioner/vercel-api";
import { buildHostname } from "@/lib/provisioner/subdomain";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min ceiling for project provision

interface ExecutePayload {
  provisionId: string;
}

const HOSTED_REPO = process.env.HOSTED_REPO ?? "BenLaurenson/PiggyBack";
// Hosted users' Vercel projects track this branch. Default to `main` for prod;
// staging orchestrators set HOSTED_TRACK_BRANCH=dev so test provisions track dev.
const HOSTED_BRANCH = process.env.HOSTED_TRACK_BRANCH ?? "main";

function generateDbPassword(): string {
  // 32-char base64url, dropped to alphanumerics for safety in URL forms.
  return randomBytes(24).toString("base64url");
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ExecutePayload;
  if (!body.provisionId) {
    return NextResponse.json({ error: "provisionId required" }, { status: 400 });
  }

  const provision = await getProvisionById(body.provisionId);
  if (!provision) {
    return NextResponse.json({ error: "Provision not found" }, { status: 404 });
  }

  try {
    switch (provision.state) {
      case "SUPABASE_AUTHED": {
        await provisionSupabaseProject(provision.id);
        await transitionState(provision.id, "SUPABASE_PROVISIONED");
        return refreshAndRespond(provision.id);
      }

      case "SUPABASE_PROVISIONED": {
        await runMigrations(provision.id);
        await transitionState(provision.id, "MIGRATIONS_RUN");
        return refreshAndRespond(provision.id);
      }

      case "MIGRATIONS_RUN":
      case "VERCEL_AUTHED": {
        // Need both Supabase migrations done AND Vercel auth before we can
        // create the Vercel project (env vars pulled from Supabase).
        const refreshed = await getProvisionById(provision.id);
        if (refreshed?.supabase_project_ref) {
          // Check Vercel auth too
          const vercelAuth = await readOAuthToken(provision.id, "vercel");
          if (vercelAuth) {
            await provisionVercelProject(provision.id);
            await transitionState(provision.id, "VERCEL_PROVISIONED");
            return refreshAndRespond(provision.id);
          }
        }
        return refreshAndRespond(provision.id);
      }

      case "VERCEL_PROVISIONED": {
        await pushEnvVars(provision.id);
        await transitionState(provision.id, "ENV_VARS_SET");
        return refreshAndRespond(provision.id);
      }

      case "ENV_VARS_SET": {
        await attachSubdomain(provision.id);
        await transitionState(provision.id, "DOMAIN_ATTACHED");
        return refreshAndRespond(provision.id);
      }

      default:
        // Other states are user-driven (UP_PAT_PROVIDED, WEBHOOK_REGISTERED)
        // or terminal (READY, FAILED, CANCELLED).
        return refreshAndRespond(provision.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit(provision.id, "PROVISION_STEP_FAILED", { state: provision.state, message });
    await transitionState(provision.id, "FAILED", message);
    return NextResponse.json({ error: message, state: "FAILED" }, { status: 500 });
  }
}

// ─── Step implementations ────────────────────────────────────────────────────

async function provisionSupabaseProject(provisionId: string): Promise<void> {
  const token = await readOAuthToken(provisionId, "supabase");
  if (!token) throw new Error("No Supabase OAuth token for provision");

  const auth = { accessToken: token.accessToken };

  // Pick the user's first org. UI should ideally let them choose, but for v1
  // we default to the first one (most users have a single personal org).
  const orgs = await listOrganizations(auth);
  if (orgs.length === 0) {
    throw new Error("Authorized Supabase user has no organizations");
  }
  const org = orgs[0];

  const provision = await getProvisionById(provisionId);
  const projectName = `piggyback-${(provision?.subdomain_short_id ?? "user").toLowerCase()}`;
  const dbPass = generateDbPassword();

  const project = await createSupabaseProject(auth, {
    organizationId: org.id,
    name: projectName,
    dbPass,
    region: "ap-southeast-2",
    plan: "free",
  });

  await waitForProjectHealthy(auth, project.ref, { timeoutMs: 5 * 60_000 });

  const supabase = createServiceRoleClient();
  await supabase
    .from("piggyback_provisions")
    .update({
      supabase_org_id: org.id,
      supabase_project_ref: project.ref,
      supabase_project_url: `https://${project.ref}.supabase.co`,
    })
    .eq("id", provisionId);

  await audit(provisionId, "SUPABASE_PROJECT_CREATED", {
    org: org.id,
    project_ref: project.ref,
    region: project.region,
  });
}

async function runMigrations(provisionId: string): Promise<void> {
  const provision = await getProvisionById(provisionId);
  if (!provision?.supabase_project_ref) throw new Error("Supabase project ref missing");
  const token = await readOAuthToken(provisionId, "supabase");
  if (!token) throw new Error("No Supabase OAuth token for provision");

  const auth = { accessToken: token.accessToken };
  const ref = provision.supabase_project_ref;

  // Read migration files in order from the bundled supabase/migrations/ dir.
  // Filename pattern: <timestamp>_<name>.sql, sorted lexicographically.
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  // Track applied migrations in a per-tenant table inside their DB so future
  // updates know what's already been run.
  const trackTableSql = `
    CREATE TABLE IF NOT EXISTS public._piggyback_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  await runSql(auth, ref, trackTableSql);

  const appliedRows = (await runSql(auth, ref, "SELECT filename FROM public._piggyback_migrations")) as Array<{ filename: string }>;
  const applied = new Set(appliedRows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await runSql(auth, ref, sql);
    await runSql(auth, ref, `INSERT INTO public._piggyback_migrations (filename) VALUES ('${file.replace(/'/g, "''")}')`);
    await audit(provisionId, "MIGRATION_APPLIED", { filename: file });
  }
}

async function provisionVercelProject(provisionId: string): Promise<void> {
  const provision = await getProvisionById(provisionId);
  if (!provision) throw new Error("Provision not found");
  const token = await readOAuthToken(provisionId, "vercel");
  if (!token) throw new Error("No Vercel OAuth token for provision");

  const auth = {
    accessToken: token.accessToken,
    teamId: provision.vercel_team_id ?? undefined,
  };

  const projectName = `piggyback-${(provision.subdomain_short_id ?? "user").toLowerCase()}`;

  const project = await createVercelProject(auth, {
    name: projectName,
    gitRepo: HOSTED_REPO,
    branch: HOSTED_BRANCH,
  });

  const supabase = createServiceRoleClient();
  await supabase
    .from("piggyback_provisions")
    .update({ vercel_project_id: project.id })
    .eq("id", provisionId);

  await audit(provisionId, "VERCEL_PROJECT_CREATED", { id: project.id, name: project.name });
}

async function pushEnvVars(provisionId: string): Promise<void> {
  const provision = await getProvisionById(provisionId);
  if (!provision?.vercel_project_id) throw new Error("Vercel project ID missing");
  if (!provision.supabase_project_ref) throw new Error("Supabase project ref missing");

  const supabaseToken = await readOAuthToken(provisionId, "supabase");
  if (!supabaseToken) throw new Error("No Supabase OAuth token for provision");
  const vercelToken = await readOAuthToken(provisionId, "vercel");
  if (!vercelToken) throw new Error("No Vercel OAuth token for provision");

  const keys = await getProjectKeys(
    { accessToken: supabaseToken.accessToken },
    provision.supabase_project_ref
  );

  // Generate a per-tenant encryption key for their app's UP_API_ENCRYPTION_KEY.
  const tenantEncryptionKey = randomBytes(32).toString("hex");

  const hostname = buildHostname(provision.subdomain_vanity ?? provision.subdomain_short_id ?? "user");
  const appUrl = `https://${hostname}`;

  await setEnvVars(
    {
      accessToken: vercelToken.accessToken,
      teamId: provision.vercel_team_id ?? undefined,
    },
    provision.vercel_project_id,
    [
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: keys.url },
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: keys.anonKey },
      { key: "SUPABASE_SERVICE_ROLE_KEY", value: keys.serviceRoleKey },
      { key: "UP_API_ENCRYPTION_KEY", value: tenantEncryptionKey },
      { key: "NEXT_PUBLIC_APP_URL", value: appUrl },
      { key: "NEXT_PUBLIC_SKIP_LANDING", value: "true" },
    ]
  );

  await audit(provisionId, "ENV_VARS_PUSHED", { hostname });
}

async function attachSubdomain(provisionId: string): Promise<void> {
  const provision = await getProvisionById(provisionId);
  if (!provision?.vercel_project_id) throw new Error("Vercel project ID missing");
  const vercelToken = await readOAuthToken(provisionId, "vercel");
  if (!vercelToken) throw new Error("No Vercel OAuth token for provision");

  const hostname = buildHostname(provision.subdomain_vanity ?? provision.subdomain_short_id ?? "user");

  await addProjectDomain(
    {
      accessToken: vercelToken.accessToken,
      teamId: provision.vercel_team_id ?? undefined,
    },
    provision.vercel_project_id,
    hostname
  );

  // Trigger an initial deployment so the domain has somewhere to land.
  await triggerDeployment(
    {
      accessToken: vercelToken.accessToken,
      teamId: provision.vercel_team_id ?? undefined,
    },
    {
      projectId: provision.vercel_project_id,
      gitBranch: HOSTED_BRANCH,
      name: `piggyback-${provision.subdomain_short_id}`,
    }
  );

  await audit(provisionId, "DOMAIN_ATTACHED", { hostname });
}

async function refreshAndRespond(provisionId: string) {
  const refreshed = await getProvisionById(provisionId);
  return NextResponse.json({
    state: refreshed?.state ?? null,
    detail: refreshed?.state_detail ?? null,
    subdomain: refreshed?.subdomain_vanity ?? refreshed?.subdomain_short_id ?? null,
  });
}
