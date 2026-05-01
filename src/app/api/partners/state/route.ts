/**
 * GET /api/partners/state — orchestrator-only.
 *
 * Returns the caller's active/pending partner_link plus their outstanding
 * invitations. Used by /settings/partner UI.
 *
 * PATCH /api/partners/state — toggle consent flags on the active link.
 * Body: { partner_link_id, consent_aggregate_view?, consent_transaction_view? }
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveOrchestratorCaller } from "@/lib/partners/auth";
import { getPartnerState, updateConsents } from "@/lib/partners/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const callerResult = await resolveOrchestratorCaller();
  if (!callerResult.ok) {
    return NextResponse.json(
      { error: callerResult.error },
      { status: callerResult.status }
    );
  }
  const state = await getPartnerState(callerResult.caller.provisionId);
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

interface PatchPayload {
  partner_link_id?: unknown;
  consent_aggregate_view?: unknown;
  consent_transaction_view?: unknown;
}

export async function PATCH(request: NextRequest) {
  const callerResult = await resolveOrchestratorCaller();
  if (!callerResult.ok) {
    return NextResponse.json(
      { error: callerResult.error },
      { status: callerResult.status }
    );
  }
  let body: PatchPayload;
  try {
    body = (await request.json()) as PatchPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const partnerLinkId =
    typeof body.partner_link_id === "string" ? body.partner_link_id : "";
  if (!partnerLinkId) {
    return NextResponse.json(
      { error: "partner_link_id required" },
      { status: 400 }
    );
  }
  const result = await updateConsents({
    partnerLinkId,
    callerProvisionId: callerResult.caller.provisionId,
    consentAggregateView:
      typeof body.consent_aggregate_view === "boolean"
        ? body.consent_aggregate_view
        : undefined,
    consentTransactionView:
      typeof body.consent_transaction_view === "boolean"
        ? body.consent_transaction_view
        : undefined,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
