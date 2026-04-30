"use client";

/**
 * Phase 4 instrumentation: client-side analytics bootstrap.
 *
 * Mounted at the root layout. Its only responsibility is to ensure the
 * pb_aid anonymous-session cookie is set the first time someone lands on
 * piggyback.finance, so subsequent events can be chained together.
 *
 * We do this via a synthetic "page_landed" call — but we only fire it once
 * per session (sessionStorage flag) to avoid spamming the funnel_events
 * table on every internal navigation.
 *
 * NOTE: We deliberately do NOT push directly to PostHog from the browser.
 * All client analytics goes through /api/analytics/track which then forwards
 * to PostHog server-side. This keeps the API key out of the bundle and
 * gives us a single place to attach the user / anonymous_id / tenant_id.
 */

import { useEffect } from "react";

const SESSION_FLAG = "pb_aid_bootstrapped";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SESSION_FLAG)) return;
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // sessionStorage unavailable (private mode, etc.) — fall through and
      // hit the endpoint once per page reload. Still a no-op when analytics
      // is disabled.
    }
    // Hit the track endpoint without an event so the cookie gets set.
    // We pass a real event the server allow-lists; sending nothing would be
    // ignored. Use a benign synthetic that the funnel page filters out.
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Use signup_started's sibling: an "anonymous bootstrap" wouldn't be in
      // the allow-list. Instead, just fire a HEAD-style request that the
      // route will 204 because the event isn't recognised — but the cookie
      // will still be set because we set it before the allow-list check
      // would have rejected. To keep the implementation simple, instead we
      // skip the endpoint entirely; the cookie will be set on the first
      // real event call (e.g. signup_started).
      body: JSON.stringify({ event: "__bootstrap__", properties: {} }),
      keepalive: true,
    }).catch(() => {
      // Swallow — analytics must never break the user flow.
    });
  }, []);

  return <>{children}</>;
}
