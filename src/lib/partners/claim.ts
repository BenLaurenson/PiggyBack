/**
 * Partner-claim invitation acceptance + rejection.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * `claimInvitation` validates the token (lifetime, single-use, email-binding,
 * self-claim) then atomically creates a `partner_links` row + marks the
 * invitation row claimed. Cross-tenant `is_remote_mirror` rows are NOT
 * created here — that work happens in the API route via the fan-out helper
 * because it needs the partnership_id from the inviter's tenant + an HTTP
 * call to the claimer's tenant. Keeping that out of this pure DB function
 * lets us unit-test the rules without mocking HTTP.
 *
 * Service-role client only. Caller (the API route) is responsible for
 * authorising that the claimer's session matches `claimerProvisionId` and
 * `claimerEmail`.
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { assertOrchestrator } from "@/lib/role-context";

export interface ClaimInvitationArgs {
  token: string;
  claimerProvisionId: string;
  claimerEmail: string;
}

export type ClaimInvitationResult =
  | {
      ok: true;
      partnerLinkId: string;
      inviterProvisionId: string;
      invitationId: string;
      invitedByPartnershipId: string | null;
    }
  | { ok: false; error: string };

interface InvitationRow {
  id: string;
  invitee_email: string;
  invited_by_provision_id: string;
  invited_by_partnership_id: string | null;
  expires_at: string;
  claimed_at: string | null;
  rejected_at: string | null;
}

export async function claimInvitation(
  args: ClaimInvitationArgs
): Promise<ClaimInvitationResult> {
  assertOrchestrator("claimInvitation");
  const supabase = createServiceRoleClient();

  const { data: invitationData, error: lookupErr } = await supabase
    .from("partner_claim_invitations")
    .select(
      "id, invitee_email, invited_by_provision_id, invited_by_partnership_id, expires_at, claimed_at, rejected_at"
    )
    .eq("token", args.token)
    .maybeSingle();

  if (lookupErr) {
    console.error("[claim] invitation lookup failed", lookupErr);
    return { ok: false, error: "Could not look up invitation." };
  }

  const invitation = invitationData as InvitationRow | null;
  if (!invitation) {
    return { ok: false, error: "Invitation not found." };
  }

  if (invitation.claimed_at) {
    return { ok: false, error: "Invitation already used." };
  }
  if (invitation.rejected_at) {
    return { ok: false, error: "Invitation was declined." };
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      error: "Invitation expired. Ask for a new one.",
    };
  }
  if (
    invitation.invitee_email.toLowerCase() !== args.claimerEmail.toLowerCase()
  ) {
    return {
      ok: false,
      error: `This invitation was sent to ${invitation.invitee_email}.`,
    };
  }
  if (invitation.invited_by_provision_id === args.claimerProvisionId) {
    return { ok: false, error: "You can't claim your own invitation." };
  }

  const nowIso = new Date().toISOString();
  const { data: linkData, error: linkErr } = await supabase
    .from("partner_links")
    .insert({
      initiator_provision_id: invitation.invited_by_provision_id,
      acceptor_provision_id: args.claimerProvisionId,
      status: "active",
      active_at: nowIso,
    })
    .select("id")
    .single();

  if (linkErr || !linkData) {
    console.error("[claim] partner_links insert failed", linkErr);
    return {
      ok: false,
      error: linkErr?.message ?? "Could not create partner link.",
    };
  }

  const { error: claimErr } = await supabase
    .from("partner_claim_invitations")
    .update({
      claimed_at: nowIso,
      claimed_provision_id: args.claimerProvisionId,
    })
    .eq("id", invitation.id);

  if (claimErr) {
    // Best-effort: the link exists; the marker is bookkeeping. Surface in
    // logs so a stuck "pending" row can be cleaned up by hand.
    console.error("[claim] failed to mark claimed_at", claimErr);
  }

  return {
    ok: true,
    partnerLinkId: (linkData as { id: string }).id,
    inviterProvisionId: invitation.invited_by_provision_id,
    invitationId: invitation.id,
    invitedByPartnershipId: invitation.invited_by_partnership_id,
  };
}

export async function rejectInvitation(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertOrchestrator("rejectInvitation");
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("partner_claim_invitations")
    .update({ rejected_at: new Date().toISOString() })
    .eq("token", token)
    .is("claimed_at", null);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
