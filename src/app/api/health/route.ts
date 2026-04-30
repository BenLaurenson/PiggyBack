/**
 * Per-tenant health endpoint. The hosted-platform orchestrator hits this
 * every 15 minutes to flag deployments that have gone dark.
 *
 * Checks the app is responding AND the Supabase connection works. Uses the
 * service role client so RLS doesn't make a healthy connection look unhealthy.
 * Doesn't exercise external dependencies (Up Bank, AI provider) so they can't
 * drag the health signal down.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";

export async function GET() {
  let supabaseOk = true;
  try {
    const supabase = createServiceRoleClient();
    // `categories` is reference data with no user-scoped RLS — a head-count is
    // a cheap, reliable round-trip that proves the DB connection works.
    const { error } = await supabase
      .from("categories")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) supabaseOk = false;
  } catch {
    supabaseOk = false;
  }

  return NextResponse.json(
    {
      status: supabaseOk ? "ok" : "degraded",
      supabase: supabaseOk,
      timestamp: new Date().toISOString(),
    },
    { status: supabaseOk ? 200 : 503 }
  );
}
