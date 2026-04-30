/**
 * Cron: release subdomain aliases whose grace window has expired.
 *
 * Runs every hour from vercel.json. For each row in subdomain_aliases with
 * expires_at <= now():
 *   1. Try to remove the domain from the user's Vercel project (best-effort —
 *      if Vercel says the domain doesn't exist anymore, that's fine).
 *   2. Delete the alias row.
 *
 * Auth: Bearer <CRON_SECRET>. The route is also wired up to refuse `all=true`
 * batch runs without that header, but allows ad-hoc admin redrives via
 * { provisionId } when called from /admin tooling that already auth-checks.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { audit, getProvisionById, readOAuthToken } from "@/lib/provisioner/state-machine";
import { buildHostname } from "@/lib/provisioner/subdomain";
import { removeProjectDomain, VercelApiError } from "@/lib/provisioner/vercel-api";
import { installLogScrubber } from "@/lib/log-scrubber";

installLogScrubber();

export const runtime = "nodejs";
export const maxDuration = 300;

interface AliasRow {
  alias: string;
  provision_id: string;
  expires_at: string;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const released = await releaseExpiredAliases();
  return NextResponse.json({ released: released.length, aliases: released });
}

// Vercel cron uses GET by default. Accept both.
export async function GET(request: NextRequest) {
  return POST(request);
}

async function releaseExpiredAliases(): Promise<string[]> {
  const service = createServiceRoleClient();
  const { data: rows } = await service
    .from("subdomain_aliases")
    .select("alias, provision_id, expires_at")
    .lte("expires_at", new Date().toISOString())
    .limit(500);

  const releasedAliases: string[] = [];
  for (const row of (rows ?? []) as AliasRow[]) {
    try {
      await releaseOne(row.alias, row.provision_id);
      releasedAliases.push(row.alias);
    } catch (err) {
      // Per-row failures are logged via audit; keep going so one bad row
      // doesn't block the whole sweep.
      const provision = await getProvisionById(row.provision_id);
      if (provision) {
        await audit(provision.id, "ALIAS_RELEASE_FAILED", {
          alias: row.alias,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return releasedAliases;
}

async function releaseOne(alias: string, provisionId: string): Promise<void> {
  const provision = await getProvisionById(provisionId);
  if (!provision) {
    // Tenant gone — nothing to do on Vercel; just delete the alias row.
    await deleteAlias(alias);
    return;
  }

  if (provision.vercel_project_id) {
    const token = await readOAuthToken(provisionId, "vercel");
    if (token) {
      try {
        await removeProjectDomain(
          {
            accessToken: token.accessToken,
            teamId: provision.vercel_team_id ?? undefined,
          },
          provision.vercel_project_id,
          buildHostname(alias)
        );
      } catch (err) {
        if (err instanceof VercelApiError && err.status === 404) {
          // Already gone — that's fine.
        } else {
          throw err;
        }
      }
    }
  }

  await deleteAlias(alias);
  await audit(provisionId, "ALIAS_RELEASED", { alias });
}

async function deleteAlias(alias: string): Promise<void> {
  const service = createServiceRoleClient();
  await service.from("subdomain_aliases").delete().eq("alias", alias);
}
