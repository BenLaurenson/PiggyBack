import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getClientIp, RateLimiter } from "@/lib/rate-limiter";
import { reconcileStaleAccounts } from "@/lib/sync/reconciliation";

// Cron endpoint: 5 requests per minute (generous for retries, but prevents
// brute-force attempts on CRON_SECRET).
const cronLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });

// Reconciliation can take a while if many users need re-syncing.
export const maxDuration = 300;

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rateCheck = cronLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60_000) / 1000)),
        },
      }
    );
  }

  // Verify cron secret with a timing-safe comparison.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const expected = `Bearer ${cronSecret || ""}`;
  const provided = authHeader || "";

  if (
    !cronSecret ||
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reconcileStaleAccounts(50);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[cron sync-reconciliation] failed", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
