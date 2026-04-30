/**
 * Server-side analytics. Phase 4 instrumentation.
 *
 * Two outputs:
 *   1. PostHog Cloud HTTP capture API — gated by NEXT_PUBLIC_ANALYTICS_ENABLED
 *      so self-hosters can opt out by leaving the env var unset.
 *   2. funnel_events table mirror — always written, so /admin/funnel works
 *      even when no third-party analytics is configured.
 *
 * Both writes are best-effort: failures never throw. We log structured JSON
 * to the console (consistent with audit-logger.ts) so dropped events are
 * still observable in Vercel runtime logs.
 */

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { FunnelEventName } from "./events";

const POSTHOG_DEFAULT_HOST = "https://us.i.posthog.com";

interface TrackOptions {
  /** Set when the user is authenticated. Preferred over anonymousId. */
  userId?: string | null;
  /** Set when the user is unauthenticated. Comes from the pb_aid cookie. */
  anonymousId?: string | null;
  /** Multi-tenant: set after tenant_ready fires. Currently == userId. */
  tenantId?: string | null;
  /** Arbitrary event metadata. */
  properties?: Record<string, unknown>;
}

function isAnalyticsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";
}

/**
 * Write the event to the funnel_events table via the service role client.
 * This is the local mirror that powers /admin/funnel without depending on
 * a third-party analytics provider.
 */
async function writeToFunnelEventsTable(
  event: FunnelEventName,
  options: TrackOptions
): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Service role not configured — skip the local mirror. The PostHog
      // write may still succeed.
      return;
    }
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("funnel_events").insert({
      event_name: event,
      user_id: options.userId ?? null,
      anonymous_id: options.anonymousId ?? null,
      tenant_id: options.tenantId ?? null,
      properties: options.properties ?? {},
    });
    if (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          source: "analytics.server",
          msg: "failed to write funnel_events row",
          event,
          error: error.message,
        })
      );
    }
  } catch (err) {
    // Don't ever throw out of an analytics call.
    console.warn(
      JSON.stringify({
        level: "warn",
        source: "analytics.server",
        msg: "unexpected error writing funnel_events",
        event,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/**
 * Send the event to PostHog Cloud's /capture/ endpoint. No-op when
 * analytics is disabled or no API key is set.
 */
async function writeToPostHog(
  event: FunnelEventName,
  options: TrackOptions
): Promise<void> {
  if (!isAnalyticsEnabled()) return;

  const apiKey = process.env.POSTHOG_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? POSTHOG_DEFAULT_HOST;
  // PostHog requires a non-empty distinct_id. Prefer userId, then tenantId,
  // then anonymousId, then a synthetic per-event UUID (so we don't drop the
  // event entirely). The synthetic case shouldn't happen in practice.
  const distinctId =
    options.userId ??
    options.tenantId ??
    options.anonymousId ??
    `unknown-${crypto.randomUUID()}`;

  const body = {
    api_key: apiKey,
    event,
    distinct_id: distinctId,
    properties: {
      ...(options.properties ?? {}),
      ...(options.anonymousId ? { $anon_distinct_id: options.anonymousId } : {}),
      ...(options.tenantId ? { tenant_id: options.tenantId } : {}),
      $lib: "piggyback-server",
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Short timeout — analytics should never block a request.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          level: "warn",
          source: "analytics.server",
          msg: "posthog capture non-2xx",
          event,
          status: res.status,
        })
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        source: "analytics.server",
        msg: "posthog capture failed",
        event,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/**
 * Fire-and-forget event tracker. Never throws.
 *
 * Writes to both the local funnel_events table and PostHog (when enabled).
 * Both writes happen in parallel.
 */
export async function track(
  event: FunnelEventName,
  options: TrackOptions = {}
): Promise<void> {
  // Audit-style log line so events are visible in Vercel runtime logs even
  // when neither sink is configured.
  console.log(
    JSON.stringify({
      level: "analytics" as const,
      timestamp: new Date().toISOString(),
      event,
      userId: options.userId ?? null,
      anonymousId: options.anonymousId ?? null,
      tenantId: options.tenantId ?? null,
    })
  );

  await Promise.allSettled([
    writeToFunnelEventsTable(event, options),
    writeToPostHog(event, options),
  ]);
}

/**
 * Returns true when analytics is configured (either via PostHog or the
 * local mirror). Useful for surfacing setup state on /admin/funnel.
 */
export function analyticsConfigured(): {
  postHog: boolean;
  localMirror: boolean;
} {
  return {
    postHog:
      isAnalyticsEnabled() &&
      Boolean(process.env.POSTHOG_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY),
    localMirror: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

/**
 * "First-time-only" event helper. Fires `event` for `userId` only if no
 * funnel_events row already exists for that pair. Used for activation
 * events (first_budget_created, first_goal_created, etc.) so the same
 * user calling createBudget twice doesn't double-fire the event.
 *
 * Uses the local mirror as the source of truth — analytics-disabled
 * deployments fall back to firing every time, which is fine because the
 * event would be a no-op anyway.
 */
export async function trackFirst(
  event: FunnelEventName,
  options: TrackOptions = {}
): Promise<void> {
  if (!options.userId) {
    // Without a user we can't dedupe — just fire it.
    await track(event, options);
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // No local mirror — we can't dedupe. Fall back to always firing.
    await track(event, options);
    return;
  }
  try {
    const supabase = createServiceRoleClient();
    const { count } = await supabase
      .from("funnel_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", event)
      .eq("user_id", options.userId);
    if ((count ?? 0) > 0) {
      // Already fired before — no-op.
      return;
    }
  } catch {
    // If the dedupe lookup fails, fall through and fire — better to
    // double-count than to silently lose an activation event.
  }
  await track(event, options);
}
