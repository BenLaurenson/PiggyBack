/**
 * POST /api/partners/invite — orchestrator-only.
 *
 * Body: { partnership_id: string; invitee_email: string; manual_partner_name?: string | null }
 *
 * Sends a partner-claim invitation email. Rate-limited to 5/hour per
 * caller's provision to defend against email-enumeration spam (spec #2).
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 */
import { NextResponse, type NextRequest } from "next/server";
import { createInvitation } from "@/lib/partners/invitations";
import { resolveOrchestratorCaller } from "@/lib/partners/auth";
import { partnerInviteLimiter, getClientIp, rateLimitKey } from "@/lib/rate-limiter";

export const runtime = "nodejs";

interface InvitePayload {
  partnership_id?: unknown;
  invitee_email?: unknown;
  manual_partner_name?: unknown;
}

export async function POST(request: NextRequest) {
  const callerResult = await resolveOrchestratorCaller();
  if (!callerResult.ok) {
    return NextResponse.json({ error: callerResult.error }, { status: callerResult.status });
  }
  const caller = callerResult.caller;

  const ip = getClientIp(request);
  const limit = partnerInviteLimiter.check(rateLimitKey(caller.provisionId, ip));
  if (!limit.allowed) {
    const retryAfter = Math.ceil((limit.retryAfterMs ?? 60 * 60 * 1000) / 1000);
    return NextResponse.json(
      { error: "Too many invitations sent. Try again in an hour." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body: InvitePayload;
  try {
    body = (await request.json()) as InvitePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const partnershipId =
    typeof body.partnership_id === "string" ? body.partnership_id : "";
  const inviteeEmail =
    typeof body.invitee_email === "string" ? body.invitee_email : "";
  const manualPartnerName =
    typeof body.manual_partner_name === "string" && body.manual_partner_name.trim()
      ? body.manual_partner_name.trim()
      : null;

  if (!partnershipId) {
    return NextResponse.json({ error: "partnership_id required" }, { status: 400 });
  }
  if (!inviteeEmail) {
    return NextResponse.json({ error: "invitee_email required" }, { status: 400 });
  }

  const inviterDisplayName = caller.displayName ?? caller.email;

  const result = await createInvitation({
    invitedByProvisionId: caller.provisionId,
    invitedByPartnershipId: partnershipId,
    inviteeEmail,
    manualPartnerName,
    inviterDisplayName,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    invitation_id: result.invitationId,
    token: result.token,
  });
}
