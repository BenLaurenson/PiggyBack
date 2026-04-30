/**
 * Phase 4 instrumentation: returned_d1 / returned_d7 / returned_d30 cron.
 *
 * For every user whose tenant_ready event was fired exactly N days ago AND
 * whose profiles.last_seen_at falls within the last 24 hours, fire the
 * matching returned_dN event. Idempotent: trackFirst dedupes per
 * (user_id, event_name) so re-running this cron the same day is safe.
 *
 * Schedule via Vercel cron in vercel.json (run daily). Uses the same
 * CRON_SECRET bearer-token gate as /api/cron/notifications.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getClientIp, RateLimiter } from "@/lib/rate-limiter";
import { trackFirst } from "@/lib/analytics/server";
import { FunnelEvent, type FunnelEventName } from "@/lib/analytics/events";

const cronLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });

const RETENTION_WINDOWS: Array<{ days: number; event: FunnelEventName }> = [
  { days: 1, event: FunnelEvent.RETURNED_D1 },
  { days: 7, event: FunnelEvent.RETURNED_D7 },
  { days: 30, event: FunnelEvent.RETURNED_D30 },
];

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  // Constant-time comparison to avoid timing attacks
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

  const ip = getClientIp(req);
  const limit = cronLimiter.check(ip);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = createServiceRoleClient();
  const results: Record<string, number> = {};

  for (const window of RETENTION_WINDOWS) {
    const cohortStart = new Date(Date.now() - (window.days + 1) * 24 * 60 * 60 * 1000);
    const cohortEnd = new Date(Date.now() - window.days * 24 * 60 * 60 * 1000);
    const seenSince = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find users whose tenant_ready landed in the cohort window AND who
    // have been seen in the last 24h.
    const { data: cohort, error: cohortErr } = await supabase
      .from("funnel_events")
      .select("user_id")
      .eq("event_name", FunnelEvent.TENANT_READY)
      .gte("created_at", cohortStart.toISOString())
      .lt("created_at", cohortEnd.toISOString());

    if (cohortErr || !cohort) {
      results[window.event] = 0;
      continue;
    }

    const userIds = Array.from(
      new Set(cohort.map((r) => r.user_id).filter((u): u is string => !!u))
    );
    if (userIds.length === 0) {
      results[window.event] = 0;
      continue;
    }

    const { data: returnedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .in("id", userIds)
      .gte("last_seen_at", seenSince.toISOString());

    const returnedIds = (returnedProfiles ?? []).map((p) => p.id);

    let fired = 0;
    for (const userId of returnedIds) {
      // trackFirst dedupes against funnel_events so this is idempotent
      await trackFirst(window.event, {
        userId,
        tenantId: userId,
      });
      fired += 1;
    }

    results[window.event] = fired;
  }

  return NextResponse.json({ ok: true, fired: results });
}

// POST is also accepted so test harnesses can trigger it.
export const POST = GET;
