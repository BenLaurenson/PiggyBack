/**
 * Client-side analytics. Phase 4 instrumentation.
 *
 * Calls /api/analytics/track on the server, which then forwards to PostHog
 * (when enabled) and the funnel_events table. We don't talk to PostHog
 * directly from the browser to avoid the extra network round trip and to
 * keep the API key server-side.
 *
 * No-op when NEXT_PUBLIC_ANALYTICS_ENABLED !== 'true' AND there is no
 * service-role key configured server-side. The /api endpoint handles that
 * check internally so the client can call this unconditionally.
 */

import type { FunnelEventName } from "./events";

interface TrackClientOptions {
  properties?: Record<string, unknown>;
}

/**
 * Fire-and-forget event tracker. Never throws.
 */
export async function trackClient(
  event: FunnelEventName,
  options: TrackClientOptions = {}
): Promise<void> {
  // We use keepalive so the request still goes out if the user navigates
  // away mid-flight (e.g. signup_started fires immediately before the
  // signup form is submitted).
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        properties: options.properties ?? {},
      }),
      keepalive: true,
    });
  } catch {
    // Swallow — analytics must never break the user flow.
  }
}
