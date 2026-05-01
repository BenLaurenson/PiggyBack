/**
 * Tenant-side receiver for orchestrator-emitted partner mirror webhooks.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 * Emitter: src/lib/partners/mirror-webhooks.ts (orchestrator).
 *
 * Verifies HMAC against ORCHESTRATOR_WEBHOOK_SECRET, then ack's. The actual
 * mirror row insert/delete is intentionally TODO until the first real tenant
 * comes online — at that point we can exercise the schema (the existing
 * partnership_members.user_id NOT NULL constraint needs handling for mirror
 * rows that don't have a local user) end-to-end before committing to a shape.
 *
 * Until then, this exists so the orchestrator's fan-out doesn't 404 against a
 * provisioned tenant deploy. Logs every payload it receives for debugging.
 */
import { NextResponse } from "next/server";
import {
  verifyMirrorSignature,
  type MirrorWebhookPayload,
} from "@/lib/partners/mirror-webhooks";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ORCHESTRATOR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[partner-mirror] ORCHESTRATOR_WEBHOOK_SECRET unset");
    return NextResponse.json(
      { ok: false, error: "Webhook receiver not configured" },
      { status: 503 }
    );
  }

  const signature = request.headers.get("x-piggyback-signature");
  const emittedAt = request.headers.get("x-piggyback-emitted-at");
  if (!signature || !emittedAt) {
    return NextResponse.json(
      { ok: false, error: "Missing signature headers" },
      { status: 400 }
    );
  }

  const body = await request.text();

  if (!verifyMirrorSignature({ body, signature, emittedAt, secret })) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  let payload: MirrorWebhookPayload;
  try {
    payload = JSON.parse(body) as MirrorWebhookPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Replay-protection: reject payloads more than 5 minutes old. The signature
  // is bound to emittedAt so an attacker can't forge a fresh timestamp without
  // the secret, but stale-but-genuine deliveries (e.g., retried hours later
  // after a spec change) should be rejected to keep state convergent.
  const emittedMs = new Date(emittedAt).getTime();
  if (!Number.isFinite(emittedMs)) {
    return NextResponse.json(
      { ok: false, error: "Invalid emitted_at" },
      { status: 400 }
    );
  }
  const skewMs = Math.abs(Date.now() - emittedMs);
  if (skewMs > 5 * 60 * 1000) {
    return NextResponse.json(
      { ok: false, error: "Stale webhook" },
      { status: 410 }
    );
  }

  console.log("[partner-mirror] received", {
    event: payload.event,
    partner_link_id: payload.partner_link_id,
    recipient_provision_id: payload.recipient_provision_id,
    remote_provision_id: payload.remote_provision_id,
    invited_by_partnership_id: payload.invited_by_partnership_id,
  });

  // TODO(spec #2): when the first tenant comes online, implement:
  //   - link_created: insert partnership_members row with is_remote_mirror=true,
  //     remote_provision_id=payload.remote_provision_id. Will need to handle
  //     the user_id NOT NULL constraint (either relax it via migration or use
  //     a sentinel pattern).
  //   - link_severed: delete the matching partnership_members row by
  //     remote_provision_id.

  return NextResponse.json({ ok: true, event: payload.event });
}
