/**
 * GET /api/orchestrator/partner-aggregates — orchestrator-only.
 *
 * Query: ?partner_provision_id=...&month=YYYY-MM
 *
 * Returns the partner's monthly income/expense aggregates by fanning out to
 * their tenant Supabase project via the orchestrator's stored Supabase
 * Management OAuth token. Cache-Control: no-store — partner data must be
 * fresh on every load.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveOrchestratorCaller } from "@/lib/partners/auth";
import { fetchPartnerAggregates } from "@/lib/partners/fanout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const callerResult = await resolveOrchestratorCaller();
  if (!callerResult.ok) {
    return NextResponse.json(
      { error: callerResult.error },
      { status: callerResult.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  const caller = callerResult.caller;

  const partnerProvisionId =
    request.nextUrl.searchParams.get("partner_provision_id") ?? "";
  const monthKey = request.nextUrl.searchParams.get("month") ?? "";
  if (!partnerProvisionId) {
    return NextResponse.json(
      { error: "partner_provision_id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!monthKey) {
    return NextResponse.json(
      { error: "month required (YYYY-MM)" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await fetchPartnerAggregates({
    requesterProvisionId: caller.provisionId,
    partnerProvisionId,
    monthKey,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  if ("hidden" in result) {
    return NextResponse.json(
      { hidden: true },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    {
      partner_provision_id: partnerProvisionId,
      month: monthKey,
      ...result.aggregates,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
