/**
 * POST /api/partners/sever — orchestrator-only.
 *
 * Body: { partner_link_id: string }
 *
 * Either party of an active partnership can sever it. Marks
 * `partner_links.status='severed'` and fans out the mirror-removal webhook
 * so each tenant deletes its `is_remote_mirror` row.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 */
import { NextResponse, type NextRequest } from "next/server";
import { severPartnership } from "@/lib/partners/sever";
import { resolveOrchestratorCaller } from "@/lib/partners/auth";
import { fanoutMirrorWebhook } from "@/lib/partners/mirror-webhooks";

export const runtime = "nodejs";

interface SeverPayload {
  partner_link_id?: unknown;
}

export async function POST(request: NextRequest) {
  const callerResult = await resolveOrchestratorCaller();
  if (!callerResult.ok) {
    return NextResponse.json({ error: callerResult.error }, { status: callerResult.status });
  }
  const caller = callerResult.caller;

  let body: SeverPayload;
  try {
    body = (await request.json()) as SeverPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const partnerLinkId =
    typeof body.partner_link_id === "string" ? body.partner_link_id : "";
  if (!partnerLinkId) {
    return NextResponse.json({ error: "partner_link_id required" }, { status: 400 });
  }

  const result = await severPartnership({
    partnerLinkId,
    callerProvisionId: caller.provisionId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  let mirrorResults: Array<{ provisionId: string; ok: boolean; error?: string }> = [];
  try {
    const fanout = await fanoutMirrorWebhook({
      event: "link_severed",
      partnerLinkId,
      inviterProvisionId: result.inviterProvisionId,
      acceptorProvisionId: result.acceptorProvisionId,
      invitedByPartnershipId: null,
    });
    mirrorResults = fanout.results;
  } catch (err) {
    console.error("[partners/sever] mirror fan-out threw", err);
  }

  return NextResponse.json({ ok: true, mirror_results: mirrorResults });
}
