/**
 * DELETE /api/partners/cancel — orchestrator-only.
 *
 * Body: { invitation_id: string }
 *
 * Cancels an outstanding partner-claim invitation. Authorization is enforced
 * by the underlying `cancelInvitation` query, which scopes the DELETE to the
 * caller's `invited_by_provision_id` so a stranger with the invitation_id
 * cannot revoke someone else's invite.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 */
import { NextResponse, type NextRequest } from "next/server";
import { cancelInvitation } from "@/lib/partners/invitations";
import { resolveOrchestratorCaller } from "@/lib/partners/auth";

export const runtime = "nodejs";

interface CancelPayload {
  invitation_id?: unknown;
}

export async function DELETE(request: NextRequest) {
  const callerResult = await resolveOrchestratorCaller();
  if (!callerResult.ok) {
    return NextResponse.json({ error: callerResult.error }, { status: callerResult.status });
  }
  const caller = callerResult.caller;

  let body: CancelPayload;
  try {
    body = (await request.json()) as CancelPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const invitationId =
    typeof body.invitation_id === "string" ? body.invitation_id : "";
  if (!invitationId) {
    return NextResponse.json({ error: "invitation_id required" }, { status: 400 });
  }

  const result = await cancelInvitation({
    invitationId,
    invitedByProvisionId: caller.provisionId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
