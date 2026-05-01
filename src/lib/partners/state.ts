/**
 * Read the partner state for the calling user — used by /settings/partner UI.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * Returns the active partner_link (if any) plus pending claim invitations
 * the caller has issued. Service-role only — caller is identified by their
 * orchestrator session via the API route layer.
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { assertOrchestrator } from "@/lib/role-context";

export interface PartnerStateLink {
  partner_link_id: string;
  status: "active" | "severed" | "rejected" | "pending";
  role: "initiator" | "acceptor";
  partner_provision_id: string;
  partner_display_name: string | null;
  partner_email: string;
  active_at: string | null;
  consent_aggregate_view: boolean;
  consent_transaction_view: boolean;
}

export interface PartnerStatePendingInvitation {
  id: string;
  invitee_email: string;
  manual_partner_name: string | null;
  expires_at: string;
}

export interface PartnerState {
  link: PartnerStateLink | null;
  pending_invitations: PartnerStatePendingInvitation[];
}

interface LinkRow {
  id: string;
  initiator_provision_id: string;
  acceptor_provision_id: string;
  status: string;
  active_at: string | null;
  consent_aggregate_view: boolean;
  consent_transaction_view: boolean;
}

interface ProvisionRow {
  id: string;
  email: string;
  display_name: string | null;
}

export async function getPartnerState(
  callerProvisionId: string
): Promise<PartnerState> {
  assertOrchestrator("getPartnerState");
  const supabase = createServiceRoleClient();

  const { data: linkRows } = await supabase
    .from("partner_links")
    .select(
      "id, initiator_provision_id, acceptor_provision_id, status, active_at, consent_aggregate_view, consent_transaction_view"
    )
    .or(
      `initiator_provision_id.eq.${callerProvisionId},acceptor_provision_id.eq.${callerProvisionId}`
    )
    .in("status", ["active", "pending"])
    .limit(1);
  const link = (linkRows as LinkRow[] | null)?.[0] ?? null;

  let linkOut: PartnerStateLink | null = null;
  if (link) {
    const partnerId =
      link.initiator_provision_id === callerProvisionId
        ? link.acceptor_provision_id
        : link.initiator_provision_id;
    const { data: partnerRow } = await supabase
      .from("piggyback_provisions")
      .select("id, email, display_name")
      .eq("id", partnerId)
      .maybeSingle();
    const partner = (partnerRow as ProvisionRow | null) ?? null;
    linkOut = {
      partner_link_id: link.id,
      status: link.status as PartnerStateLink["status"],
      role:
        link.initiator_provision_id === callerProvisionId
          ? "initiator"
          : "acceptor",
      partner_provision_id: partnerId,
      partner_display_name: partner?.display_name ?? null,
      partner_email: partner?.email ?? "",
      active_at: link.active_at,
      consent_aggregate_view: link.consent_aggregate_view,
      consent_transaction_view: link.consent_transaction_view,
    };
  }

  const { data: invitationRows } = await supabase
    .from("partner_claim_invitations")
    .select("id, invitee_email, manual_partner_name, expires_at")
    .eq("invited_by_provision_id", callerProvisionId)
    .is("claimed_at", null)
    .is("rejected_at", null)
    .order("expires_at", { ascending: true });

  const pending = (invitationRows as PartnerStatePendingInvitation[] | null) ?? [];

  return { link: linkOut, pending_invitations: pending };
}

/**
 * Update one or both consent toggles on a partner_links row. Caller's
 * provisionId must match either the initiator or acceptor of the link.
 */
export async function updateConsents(args: {
  partnerLinkId: string;
  callerProvisionId: string;
  consentAggregateView?: boolean;
  consentTransactionView?: boolean;
}): Promise<{ ok: boolean; error?: string; status?: 403 | 404 }> {
  assertOrchestrator("updateConsents");
  const supabase = createServiceRoleClient();
  const { data: linkRow } = await supabase
    .from("partner_links")
    .select("id, initiator_provision_id, acceptor_provision_id")
    .eq("id", args.partnerLinkId)
    .maybeSingle();
  const link = linkRow as
    | {
        id: string;
        initiator_provision_id: string;
        acceptor_provision_id: string;
      }
    | null;
  if (!link) return { ok: false, status: 404, error: "Partnership not found." };
  if (
    link.initiator_provision_id !== args.callerProvisionId &&
    link.acceptor_provision_id !== args.callerProvisionId
  ) {
    return { ok: false, status: 403, error: "Not your partnership." };
  }
  const updates: Record<string, boolean> = {};
  if (args.consentAggregateView !== undefined) {
    updates.consent_aggregate_view = args.consentAggregateView;
  }
  if (args.consentTransactionView !== undefined) {
    updates.consent_transaction_view = args.consentTransactionView;
  }
  if (Object.keys(updates).length === 0) return { ok: true };
  const { error } = await supabase
    .from("partner_links")
    .update(updates)
    .eq("id", args.partnerLinkId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
