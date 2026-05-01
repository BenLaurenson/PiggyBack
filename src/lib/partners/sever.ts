/**
 * Mark a partner_links row severed.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * Either side of the link can sever. We require the caller's provisionId
 * to be one of the two endpoints — otherwise the request is rejected to
 * prevent a stranger with a guessed link id from breaking real partnerships.
 *
 * The function returns the inviter+acceptor provision ids so the API route
 * can fan out the mirror-removal webhook.
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { assertOrchestrator } from "@/lib/role-context";

export interface SeverArgs {
  partnerLinkId: string;
  callerProvisionId: string;
}

export type SeverResult =
  | {
      ok: true;
      inviterProvisionId: string;
      acceptorProvisionId: string;
    }
  | { ok: false; status: 403 | 404 | 409 | 500; error: string };

interface LinkRow {
  id: string;
  initiator_provision_id: string;
  acceptor_provision_id: string;
  status: string;
}

export async function severPartnership(args: SeverArgs): Promise<SeverResult> {
  assertOrchestrator("severPartnership");
  const supabase = createServiceRoleClient();
  const { data: linkData, error: lookupErr } = await supabase
    .from("partner_links")
    .select("id, initiator_provision_id, acceptor_provision_id, status")
    .eq("id", args.partnerLinkId)
    .maybeSingle();
  if (lookupErr) {
    return { ok: false, status: 500, error: lookupErr.message };
  }
  const link = linkData as LinkRow | null;
  if (!link) {
    return { ok: false, status: 404, error: "Partnership not found." };
  }
  if (
    link.initiator_provision_id !== args.callerProvisionId &&
    link.acceptor_provision_id !== args.callerProvisionId
  ) {
    return { ok: false, status: 403, error: "Not your partnership." };
  }
  if (link.status === "severed") {
    return { ok: false, status: 409, error: "Already severed." };
  }
  const { error: updateErr } = await supabase
    .from("partner_links")
    .update({
      status: "severed",
      severed_at: new Date().toISOString(),
      severed_by_provision_id: args.callerProvisionId,
    })
    .eq("id", link.id);
  if (updateErr) {
    return { ok: false, status: 500, error: updateErr.message };
  }
  return {
    ok: true,
    inviterProvisionId: link.initiator_provision_id,
    acceptorProvisionId: link.acceptor_provision_id,
  };
}
