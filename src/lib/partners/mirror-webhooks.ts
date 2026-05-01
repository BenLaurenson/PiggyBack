/**
 * Cross-tenant partner mirror webhooks.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * After the orchestrator records a `partner_links` change, BOTH partners'
 * tenant Supabases need to gain (or lose) an `is_remote_mirror=true` row in
 * their `partnership_members` table. We do this by POSTing to each tenant
 * app's `/api/webhooks/partner-mirror` route, signed with HMAC-SHA256 using
 * a shared secret.
 *
 * Tenants resolve their own user / partnership locally; this payload tells
 * them WHO the remote partner is (provision id, display name) and which
 * link/event triggered the call.
 *
 * Best-effort: a webhook failure is logged but does not roll back the
 * orchestrator state change. The tenant has its own reconciliation cron in
 * spec #4 that will eventually catch divergence; this just makes the happy
 * path immediate.
 */
import { createHmac } from "crypto";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { buildHostname } from "@/lib/provisioner/subdomain";
import { assertOrchestrator } from "@/lib/role-context";

export type MirrorEvent = "link_created" | "link_severed";

export interface MirrorWebhookPayload {
  event: MirrorEvent;
  partner_link_id: string;
  // The tenant on the receiving end of this webhook.
  recipient_provision_id: string;
  // The remote partner whose mirror row should be created/removed.
  remote_provision_id: string;
  remote_display_name: string | null;
  remote_email: string | null;
  // The partnership in the inviter's tenant — the acceptor needs this only
  // for link_created so they know which local partnership this attaches to.
  // NULL for severance webhooks (each tenant resolves locally by partner_link_id).
  invited_by_partnership_id: string | null;
  emitted_at: string; // ISO timestamp; fed into the HMAC for replay protection
}

interface ProvisionRow {
  id: string;
  email: string;
  display_name: string | null;
  subdomain_short_id: string | null;
  subdomain_vanity: string | null;
}

async function loadProvisions(ids: string[]): Promise<Map<string, ProvisionRow>> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("piggyback_provisions")
    .select("id, email, display_name, subdomain_short_id, subdomain_vanity")
    .in("id", ids);
  if (error || !data) {
    throw new Error(
      `Could not load provisions for mirror webhook: ${error?.message ?? "no data"}`
    );
  }
  const map = new Map<string, ProvisionRow>();
  for (const row of data as ProvisionRow[]) {
    map.set(row.id, row);
  }
  return map;
}

function tenantUrl(provision: ProvisionRow): string | null {
  const sub = provision.subdomain_vanity ?? provision.subdomain_short_id;
  if (!sub) return null;
  return `https://${buildHostname(sub)}/api/webhooks/partner-mirror`;
}

function sign(secret: string, body: string, emittedAt: string): string {
  return createHmac("sha256", secret).update(`${emittedAt}.${body}`).digest("hex");
}

async function postSigned(
  url: string,
  payload: MirrorWebhookPayload,
  secret: string
): Promise<void> {
  const body = JSON.stringify(payload);
  const sig = sign(secret, body, payload.emitted_at);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-piggyback-signature": sig,
      "x-piggyback-emitted-at": payload.emitted_at,
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`webhook ${response.status}: ${text}`);
  }
}

/**
 * Notify both tenants of a partner-link state change.
 *
 * `partnerLinkId` is the orchestrator partner_links.id; `eventType` is the
 * mirror event. `inviterProvisionId` and `acceptorProvisionId` together name
 * the two partners. `invitedByPartnershipId` is the inviter's local
 * partnership id (used by the acceptor's tenant when first creating its
 * mirror row); pass null for severance.
 *
 * Returns the per-tenant success/failure summary so callers can audit-log.
 */
export async function fanoutMirrorWebhook(args: {
  event: MirrorEvent;
  partnerLinkId: string;
  inviterProvisionId: string;
  acceptorProvisionId: string;
  invitedByPartnershipId: string | null;
}): Promise<{
  results: Array<{ provisionId: string; ok: boolean; error?: string }>;
}> {
  assertOrchestrator("fanoutMirrorWebhook");
  const secret = process.env.ORCHESTRATOR_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[mirror-webhooks] ORCHESTRATOR_WEBHOOK_SECRET unset; skipping fan-out"
    );
    return {
      results: [
        { provisionId: args.inviterProvisionId, ok: false, error: "secret missing" },
        { provisionId: args.acceptorProvisionId, ok: false, error: "secret missing" },
      ],
    };
  }
  const provisions = await loadProvisions([
    args.inviterProvisionId,
    args.acceptorProvisionId,
  ]);
  const inviter = provisions.get(args.inviterProvisionId);
  const acceptor = provisions.get(args.acceptorProvisionId);
  if (!inviter || !acceptor) {
    throw new Error("Provision rows missing for mirror webhook");
  }
  const emittedAt = new Date().toISOString();

  // Each tenant gets a payload describing the OTHER partner.
  const targets: Array<{ recipient: ProvisionRow; remote: ProvisionRow }> = [
    { recipient: inviter, remote: acceptor },
    { recipient: acceptor, remote: inviter },
  ];

  const results: Array<{ provisionId: string; ok: boolean; error?: string }> = [];
  for (const t of targets) {
    const url = tenantUrl(t.recipient);
    if (!url) {
      results.push({
        provisionId: t.recipient.id,
        ok: false,
        error: "Tenant has no subdomain assigned yet",
      });
      continue;
    }
    const payload: MirrorWebhookPayload = {
      event: args.event,
      partner_link_id: args.partnerLinkId,
      recipient_provision_id: t.recipient.id,
      remote_provision_id: t.remote.id,
      remote_display_name: t.remote.display_name,
      remote_email: t.remote.email,
      invited_by_partnership_id: args.invitedByPartnershipId,
      emitted_at: emittedAt,
    };
    try {
      await postSigned(url, payload, secret);
      results.push({ provisionId: t.recipient.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[mirror-webhooks] fan-out failed", t.recipient.id, message);
      results.push({ provisionId: t.recipient.id, ok: false, error: message });
    }
  }
  return { results };
}

// Exported for tenant-side webhook handlers / tests so they can verify our
// signatures against the same shared secret.
export function verifyMirrorSignature(args: {
  body: string;
  signature: string;
  emittedAt: string;
  secret: string;
}): boolean {
  const expected = sign(args.secret, args.body, args.emittedAt);
  // Length check + simple constant-time compare.
  if (expected.length !== args.signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ args.signature.charCodeAt(i);
  }
  return mismatch === 0;
}
