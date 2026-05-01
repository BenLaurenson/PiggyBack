/**
 * POST /api/partners/claim — orchestrator-only.
 *
 * Body: { token: string }
 *
 * Accepts a partner-claim invitation. The caller must be signed in to the
 * orchestrator with the same email the invitation was issued for.
 *
 * On success: creates `partner_links` (status=active), marks the invitation
 * claimed, and fans out signed webhooks to BOTH tenants so each one inserts
 * its `is_remote_mirror=true` partnership_members row. Webhook failures are
 * logged but do not abort the claim — the orchestrator state is the source
 * of truth and tenants reconcile via their own crons (spec #4).
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 */
import { NextResponse, type NextRequest } from "next/server";
import { claimInvitation } from "@/lib/partners/claim";
import { resolveOrchestratorCaller } from "@/lib/partners/auth";
import { fanoutMirrorWebhook } from "@/lib/partners/mirror-webhooks";

export const runtime = "nodejs";

interface ClaimPayload {
  token?: unknown;
}

export async function POST(request: NextRequest) {
  const callerResult = await resolveOrchestratorCaller();
  if (!callerResult.ok) {
    return NextResponse.json({ error: callerResult.error }, { status: callerResult.status });
  }
  const caller = callerResult.caller;

  let body: ClaimPayload;
  try {
    body = (await request.json()) as ClaimPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const result = await claimInvitation({
    token,
    claimerProvisionId: caller.provisionId,
    claimerEmail: caller.email,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Best-effort fan-out so both tenants gain their is_remote_mirror rows.
  let mirrorResults: Array<{ provisionId: string; ok: boolean; error?: string }> = [];
  try {
    const fanout = await fanoutMirrorWebhook({
      event: "link_created",
      partnerLinkId: result.partnerLinkId,
      inviterProvisionId: result.inviterProvisionId,
      acceptorProvisionId: caller.provisionId,
      invitedByPartnershipId: result.invitedByPartnershipId,
    });
    mirrorResults = fanout.results;
  } catch (err) {
    console.error("[partners/claim] mirror fan-out threw", err);
  }

  return NextResponse.json({
    partner_link_id: result.partnerLinkId,
    inviter_provision_id: result.inviterProvisionId,
    mirror_results: mirrorResults,
  });
}
