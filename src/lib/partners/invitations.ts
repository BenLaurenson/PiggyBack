/**
 * Partner-claim invitation creation + cancellation.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * These helpers run on the orchestrator deploy only. They write to
 * `partner_claim_invitations` via the service-role Supabase client (the
 * orchestrator never gives `authenticated` users access to this table —
 * authorization is enforced at the API layer by matching the caller's
 * google_sub against piggyback_provisions). The route handler is responsible
 * for resolving and passing in the inviter's `invitedByProvisionId` /
 * `invitedByPartnershipId`.
 *
 * Email sending is best-effort — `sendPartnerInvitationEmail` swallows
 * Resend errors so a temporary email outage does not leave the user with a
 * pseudo-broken invite that exists in the DB but failed to send.
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { sendPartnerInvitationEmail } from "@/lib/email";
import { assertOrchestrator } from "@/lib/role-context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateInvitationArgs {
  invitedByProvisionId: string;
  invitedByPartnershipId: string;
  inviteeEmail: string;
  manualPartnerName: string | null;
  inviterDisplayName: string;
}

export type CreateInvitationResult =
  | { ok: true; invitationId: string; token: string }
  | { ok: false; error: string };

export async function createInvitation(
  args: CreateInvitationArgs
): Promise<CreateInvitationResult> {
  assertOrchestrator("createInvitation");
  const email = args.inviteeEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Invalid email address" };
  }
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("partner_claim_invitations")
    .insert({
      invited_by_provision_id: args.invitedByProvisionId,
      invited_by_partnership_id: args.invitedByPartnershipId,
      invitee_email: email,
      manual_partner_name: args.manualPartnerName,
    })
    .select("id, token")
    .single();
  if (error || !data) {
    console.error("[invitations] insert failed", error);
    return {
      ok: false,
      error: error?.message ?? "Could not create invitation",
    };
  }
  await sendPartnerInvitationEmail({
    to: email,
    inviterDisplayName: args.inviterDisplayName,
    manualPartnerName: args.manualPartnerName,
    token: data.token as string,
  });
  return {
    ok: true,
    invitationId: data.id as string,
    token: data.token as string,
  };
}

export interface CancelInvitationArgs {
  invitationId: string;
  invitedByProvisionId: string;
}

export type CancelInvitationResult = { ok: true } | { ok: false; error: string };

export async function cancelInvitation(
  args: CancelInvitationArgs
): Promise<CancelInvitationResult> {
  assertOrchestrator("cancelInvitation");
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("partner_claim_invitations")
    .delete()
    .eq("id", args.invitationId)
    .eq("invited_by_provision_id", args.invitedByProvisionId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
