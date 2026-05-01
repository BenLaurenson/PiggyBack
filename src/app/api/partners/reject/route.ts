/**
 * POST /api/partners/reject — orchestrator-only.
 *
 * Body: { token: string }
 *
 * Marks an invitation `rejected_at = now()`. No authentication required —
 * anyone with the token can decline (decline is a no-op security-wise; if the
 * wrong person rejects, the inviter just resends). The lib enforces "not yet
 * claimed".
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 */
import { NextResponse, type NextRequest } from "next/server";
import { rejectInvitation } from "@/lib/partners/claim";

export const runtime = "nodejs";

interface RejectPayload {
  token?: unknown;
}

export async function POST(request: NextRequest) {
  let body: RejectPayload;
  try {
    body = (await request.json()) as RejectPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const result = await rejectInvitation(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
