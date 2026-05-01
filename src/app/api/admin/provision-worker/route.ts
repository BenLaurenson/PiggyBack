/**
 * Provision worker — cron entry point.
 *
 * Picks up a small batch of in-flight provisions (non-terminal, due-now) and
 * advances each one by a single state-machine step.
 *
 * Authorization: Bearer <CRON_SECRET>. Vercel's cron sends this header when
 * the route is configured in vercel.json's "crons" block.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { advanceProvision } from "@/lib/provisioner/worker";
import { assertOrchestrator } from "@/lib/role-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const PICKUP_STATES = [
  "FAILED_RETRYABLE",
  "STRIPE_PAID", // auto-advance to AWAITING_SUPABASE_OAUTH
  "SUPABASE_CREATING",
  "MIGRATIONS_RUNNING",
  "VERCEL_CREATING",
  "VERCEL_ENV_SET",
  "DOMAIN_ATTACHING",
  "INITIAL_DEPLOY",
];

const BATCH_LIMIT = 20;

export async function POST(request: NextRequest) {
  // Refuse to run on a tenant deploy — provisioning belongs only to the
  // orchestrator (piggyback.finance).
  try {
    assertOrchestrator("provision-worker");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: pickups, error } = await supabase
    .from("piggyback_provisions")
    .select("id, state")
    .in("state", PICKUP_STATES)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const p of pickups ?? []) {
    try {
      const r = await advanceProvision(p.id);
      results.push({ id: p.id, ...r });
    } catch (err) {
      results.push({ id: p.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
