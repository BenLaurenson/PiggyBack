/**
 * Health check for a single provisioned deployment.
 *
 * Modes:
 *   - POST with { provisionId }: ad-hoc check from the admin UI.
 *   - POST with { all: true } and Authorization: Bearer <CRON_SECRET>:
 *     batch check all READY provisions. Intended for a 15-minute cron.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { audit, getProvisionById } from "@/lib/provisioner/state-machine";
import { buildHostname } from "@/lib/provisioner/subdomain";

export const runtime = "nodejs";
export const maxDuration = 300;

const HEALTH_PATH = "/api/health";
const TIMEOUT_MS = 10_000;

async function checkOne(provisionId: string): Promise<{ statusCode: number | null; responseTimeMs: number | null; error: string | null }> {
  const provision = await getProvisionById(provisionId);
  if (!provision) return { statusCode: null, responseTimeMs: null, error: "Provision not found" };
  const subdomain = provision.subdomain_vanity ?? provision.subdomain_short_id;
  if (!subdomain) return { statusCode: null, responseTimeMs: null, error: "No subdomain" };

  const url = `https://${buildHostname(subdomain)}${HEALTH_PATH}`;
  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    const elapsed = Date.now() - t0;
    return {
      statusCode: resp.status,
      responseTimeMs: elapsed,
      error: resp.ok ? null : `non-2xx`,
    };
  } catch (err) {
    return {
      statusCode: null,
      responseTimeMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordHealth(
  provisionId: string,
  result: { statusCode: number | null; responseTimeMs: number | null; error: string | null }
): Promise<void> {
  const supabase = createServiceRoleClient();
  const ok = result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300;
  const { data: existing } = await supabase
    .from("provision_health_checks")
    .select("consecutive_failures")
    .eq("provision_id", provisionId)
    .maybeSingle();
  const consecutiveFailures = ok ? 0 : (existing?.consecutive_failures ?? 0) + 1;

  await supabase.from("provision_health_checks").upsert(
    {
      provision_id: provisionId,
      last_checked_at: new Date().toISOString(),
      last_status_code: result.statusCode,
      last_response_time_ms: result.responseTimeMs,
      last_error: result.error,
      consecutive_failures: consecutiveFailures,
    },
    { onConflict: "provision_id" }
  );

  if (consecutiveFailures > 0 && consecutiveFailures % 3 === 0) {
    await audit(provisionId, "HEALTH_DEGRADED", {
      consecutiveFailures,
      lastStatusCode: result.statusCode,
      lastError: result.error,
    });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { provisionId?: string; all?: boolean };

  if (body.all) {
    // Auth: cron-secret bearer
    const authHeader = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const { data: provisions } = await supabase
      .from("piggyback_provisions")
      .select("id")
      .eq("state", "READY")
      .limit(500);

    const results: Array<{ id: string; statusCode: number | null; error: string | null }> = [];
    for (const p of provisions ?? []) {
      const result = await checkOne(p.id);
      await recordHealth(p.id, result);
      results.push({ id: p.id, statusCode: result.statusCode, error: result.error });
    }
    return NextResponse.json({ checked: results.length, results });
  }

  if (!body.provisionId) {
    return NextResponse.json({ error: "provisionId required" }, { status: 400 });
  }

  const result = await checkOne(body.provisionId);
  await recordHealth(body.provisionId, result);
  return NextResponse.json(result);
}
