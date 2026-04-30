/**
 * Per-tenant health endpoint. The hosted-platform orchestrator hits this
 * every 15 minutes to flag deployments that have gone dark.
 *
 * Checks the app is responding AND the Supabase connection works. Doesn't
 * exercise external dependencies (Up Bank, AI provider) so they can't drag
 * the health signal down.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  let supabaseOk = true;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
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
