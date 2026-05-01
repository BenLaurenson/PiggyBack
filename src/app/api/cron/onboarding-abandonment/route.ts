/**
 * Daily cron — flip onboarding state to ABANDONED for users stuck in any
 * non-READY/ABANDONED state for >7 days.
 *
 * Spec: docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md
 *
 * Triggered by Vercel cron (vercel.json) — gated on the `CRON_SECRET`
 * bearer-token, same pattern as /api/cron/funnel + /api/cron/notifications.
 *
 * Idempotent: re-running on the same day is a no-op for users already
 * abandoned (they get filtered out by the WHERE), and the underlying
 * `force_set_onboarding_state` RPC writes one audit row per call. We use
 * the forced-set variant (not the optimistic-concurrency one) because the
 * cron doesn't know each user's prior state and doesn't need to.
 *
 * Future: send a re-engagement email via Resend after each transition.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

const ABANDON_AFTER_DAYS = 7;

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(
    Date.now() - ABANDON_AFTER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: stuck, error } = await supabase
    .from("profiles")
    .select("id")
    .not("onboarding_state", "in", '("READY","ABANDONED")')
    .lt("onboarding_state_changed_at", cutoff);

  if (error) {
    return NextResponse.json(
      { error: "Failed to query stuck users", details: error.message },
      { status: 500 },
    );
  }

  let abandoned = 0;
  for (const row of stuck ?? []) {
    const { data, error: rpcError } = await supabase.rpc(
      "force_set_onboarding_state",
      {
        p_user_id: row.id,
        p_to: "ABANDONED",
        p_reason: "timeout",
      },
    );
    if (!rpcError && data === "ABANDONED") {
      abandoned += 1;
    }
    // TODO(spec): fire re-engagement email via Resend.
  }

  return NextResponse.json({
    ok: true,
    checked: stuck?.length ?? 0,
    abandoned,
  });
}

// POST is also accepted so test harnesses can trigger it without changing
// the HTTP method on the Vercel cron entry.
export const POST = GET;
