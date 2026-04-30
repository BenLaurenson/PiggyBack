/**
 * Phase 3.2 — Vanity-rename endpoint for the user's hosted subdomain.
 *
 * POST /api/account/subdomain
 *   Body: { vanity: string }
 *   Auth: signed-in Supabase auth.user; resolves to a piggyback_provisions row
 *         via google_sub === auth.user.id.
 *
 * Behaviour:
 *   1. Validate the candidate name (regex, length, reserved list).
 *   2. Enforce 30-day rate limit on vanity changes per tenant (via
 *      subdomain_vanity_set_at).
 *   3. Check uniqueness against (a) any other tenant's current subdomain and
 *      (b) any active alias.
 *   4. Attach `<vanity>.piggyback.finance` to the user's Vercel project.
 *   5. Record an alias row for the OLD subdomain (shortid OR previous vanity)
 *      with a 30-day expires_at, so the old hostname 301-redirects.
 *   6. Update the tenant row: subdomain_vanity, subdomain_vanity_set_at.
 *
 * GET /api/account/subdomain
 *   Returns the current state for the signed-in user (subdomain, vanity,
 *   cooldown remaining, list of active aliases). Used by the account page.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  audit,
  getProvisionByGoogleSub,
  readOAuthToken,
} from "@/lib/provisioner/state-machine";
import {
  ALIAS_GRACE_MS,
  buildHostname,
  computeAliasExpiry,
  validateVanityName,
  vanityChangeAllowedFrom,
} from "@/lib/provisioner/subdomain";
import {
  addProjectDomain,
  removeProjectDomain,
  VercelApiError,
} from "@/lib/provisioner/vercel-api";
import { getClientIp, RateLimiter } from "@/lib/rate-limiter";
import { installLogScrubber } from "@/lib/log-scrubber";

installLogScrubber();

export const runtime = "nodejs";
export const maxDuration = 60;

// Defence in depth — even though the per-tenant 30-day cooldown is enforced
// in DB, throttle the endpoint by IP to slow down credential-stuffing probes.
const renameLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 5 });

interface RenameBody {
  vanity?: string;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const provision = await getProvisionByGoogleSub(user.id);
  if (!provision) {
    return NextResponse.json({ error: "No provision for user" }, { status: 404 });
  }

  const lastChangedAt = await getLastChangedAt(provision.id);
  const cooldown = vanityChangeAllowedFrom(lastChangedAt);

  const service = createServiceRoleClient();
  const { data: aliases } = await service
    .from("subdomain_aliases")
    .select("alias, expires_at, kind, created_at")
    .eq("provision_id", provision.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    shortId: provision.subdomain_short_id,
    vanity: provision.subdomain_vanity,
    activeSubdomain: provision.subdomain_vanity ?? provision.subdomain_short_id,
    cooldown, // null when allowed; otherwise human-readable error string
    aliases: aliases ?? [],
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = renameLimiter.check(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many rename attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const provision = await getProvisionByGoogleSub(user.id);
  if (!provision) {
    return NextResponse.json({ error: "No provision for user" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as RenameBody;
  const vanity = (body.vanity ?? "").trim().toLowerCase();

  // 1. Validate format / reserved list.
  const validation = validateVanityName(vanity);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  // No-op if already the current vanity.
  if (provision.subdomain_vanity === vanity) {
    return NextResponse.json({ ok: true, vanity, noop: true });
  }

  // 2. Cooldown.
  const lastChangedAt = await getLastChangedAt(provision.id);
  const cooldown = vanityChangeAllowedFrom(lastChangedAt);
  if (cooldown) {
    return NextResponse.json({ error: cooldown }, { status: 429 });
  }

  // 3. Uniqueness against current tenant subdomains and active aliases.
  const service = createServiceRoleClient();
  const taken = await isSubdomainTaken(vanity, provision.id);
  if (taken) {
    return NextResponse.json({ error: "That subdomain is taken." }, { status: 409 });
  }

  // 4. Attach to Vercel. We do this BEFORE persisting so that if Vercel rejects
  // the domain (e.g. it's claimed elsewhere) the user sees the error and
  // nothing changes.
  //
  // Vercel only allows one project per hostname, so we have to detach the OLD
  // hostname from the user's project before we can re-attach it to the
  // orchestrator project below. Order:
  //   a. Add new vanity to user's project (fail-fast on rejection).
  //   b. Detach old hostname from user's project.
  //   c. Re-attach old hostname to the orchestrator project via the
  //      ORCHESTRATOR_VERCEL_TOKEN system token, so middleware on the
  //      orchestrator can serve the 301 redirect.
  const oldName = provision.subdomain_vanity ?? provision.subdomain_short_id;
  if (provision.vercel_project_id) {
    const vercelToken = await readOAuthToken(provision.id, "vercel");
    if (!vercelToken) {
      return NextResponse.json(
        { error: "Vercel authorization missing — re-link your Vercel account." },
        { status: 412 }
      );
    }
    const userAuth = {
      accessToken: vercelToken.accessToken,
      teamId: provision.vercel_team_id ?? undefined,
    };
    try {
      await addProjectDomain(userAuth, provision.vercel_project_id, buildHostname(vanity));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await audit(provision.id, "VANITY_VERCEL_ATTACH_FAILED", { vanity, message });
      return NextResponse.json(
        { error: `Couldn't attach domain: ${message}` },
        { status: 502 }
      );
    }

    if (oldName) {
      try {
        await removeProjectDomain(
          userAuth,
          provision.vercel_project_id,
          buildHostname(oldName)
        );
      } catch (err) {
        if (err instanceof VercelApiError && err.status === 404) {
          // Already detached — fine.
        } else {
          const message = err instanceof Error ? err.message : String(err);
          await audit(provision.id, "VANITY_VERCEL_DETACH_FAILED", {
            alias: oldName,
            message,
          });
          // Non-fatal: proceed with the rename. Cron sweep will retry detach
          // after the grace window if necessary.
        }
      }

      // Re-attach to the orchestrator project so middleware can 301 redirect.
      const orchToken = process.env.ORCHESTRATOR_VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
      const orchProject = process.env.ORCHESTRATOR_VERCEL_PROJECT_ID;
      const orchTeam = process.env.ORCHESTRATOR_VERCEL_TEAM_ID;
      if (orchToken && orchProject) {
        try {
          await addProjectDomain(
            { accessToken: orchToken, teamId: orchTeam },
            orchProject,
            buildHostname(oldName)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await audit(provision.id, "ORCHESTRATOR_ALIAS_ATTACH_FAILED", {
            alias: oldName,
            message,
          });
          // Non-fatal: alias row still gets recorded so the redirect cron
          // retries during its sweep.
        }
      }
    }
  }

  // 5. Record alias for the OLD subdomain so it 301-redirects for 30 days.
  const expiresAt = computeAliasExpiry();
  if (oldName) {
    const { error: aliasErr } = await service.from("subdomain_aliases").upsert(
      {
        alias: oldName,
        provision_id: provision.id,
        expires_at: expiresAt.toISOString(),
        kind: provision.subdomain_vanity ? "vanity" : "shortid",
      },
      { onConflict: "alias" }
    );
    if (aliasErr) {
      // Non-fatal — the rename can still proceed; we audit and continue.
      await audit(provision.id, "VANITY_ALIAS_INSERT_FAILED", {
        alias: oldName,
        message: aliasErr.message,
      });
    }
  }

  // 6. Persist the new vanity + bump the cooldown timestamp.
  const { error: updateErr } = await service
    .from("piggyback_provisions")
    .update({
      subdomain_vanity: vanity,
      subdomain_vanity_set_at: new Date().toISOString(),
    })
    .eq("id", provision.id);

  if (updateErr) {
    await audit(provision.id, "VANITY_DB_WRITE_FAILED", { vanity, message: updateErr.message });
    return NextResponse.json(
      { error: `Couldn't save subdomain: ${updateErr.message}` },
      { status: 500 }
    );
  }

  await audit(provision.id, "VANITY_SET", {
    vanity,
    previous: oldName,
    grace_days: ALIAS_GRACE_MS / (24 * 60 * 60 * 1000),
  });

  return NextResponse.json({
    ok: true,
    vanity,
    activeSubdomain: vanity,
    aliasFor: oldName,
    aliasExpiresAt: expiresAt.toISOString(),
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getLastChangedAt(provisionId: string): Promise<Date | null> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("piggyback_provisions")
    .select("subdomain_vanity_set_at")
    .eq("id", provisionId)
    .maybeSingle();
  if (!data?.subdomain_vanity_set_at) return null;
  return new Date(data.subdomain_vanity_set_at);
}

async function isSubdomainTaken(name: string, selfProvisionId: string): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data: prov } = await service
    .from("piggyback_provisions")
    .select("id")
    .or(`subdomain_short_id.eq.${name},subdomain_vanity.eq.${name}`)
    .neq("id", selfProvisionId)
    .maybeSingle();
  if (prov) return true;

  const { data: alias } = await service
    .from("subdomain_aliases")
    .select("provision_id, expires_at")
    .eq("alias", name)
    .maybeSingle();
  if (!alias) return false;
  // Alias from a different tenant that hasn't expired blocks the name.
  if (alias.provision_id !== selfProvisionId && new Date(alias.expires_at) > new Date()) {
    return true;
  }
  return false;
}
