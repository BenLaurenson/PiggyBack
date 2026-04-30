/**
 * Phase 4 instrumentation: client-side event capture endpoint.
 *
 * The browser never talks to PostHog directly. Instead it POSTs here, and
 * this route:
 *   1. Resolves the user (Supabase session) if any
 *   2. Reads the pb_aid anonymous-session cookie (set on first landing)
 *   3. Forwards the event to the server-side track() helper
 *
 * Permissive by design — this is fire-and-forget telemetry. We never
 * surface a 5xx to the client.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { track } from "@/lib/analytics/server";
import { FunnelEvent, type FunnelEventName } from "@/lib/analytics/events";
import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_MAX_AGE_SECONDS,
  generateAnonymousId,
} from "@/lib/analytics/anonymous-id";

const ALLOWED_EVENTS = new Set<FunnelEventName>(Object.values(FunnelEvent));

const RequestSchema = z.object({
  event: z.string().min(1).max(64),
  properties: z.record(z.string(), z.unknown()).optional(),
});

function setAnonCookie(response: NextResponse, anonymousId: string) {
  response.cookies.set(ANONYMOUS_ID_COOKIE, anonymousId, {
    httpOnly: false, // readable from the client if we ever need to surface it
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ANONYMOUS_ID_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function POST(request: NextRequest) {
  // Always resolve / set the anonymous-id cookie — that's the bootstrap
  // contract. We do this even if the event payload is malformed or the
  // event name isn't in the allow-list, so the AnalyticsProvider can use
  // any benign event to seed the cookie on first landing.
  const existingAnonId = request.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null;
  const anonymousId = existingAnonId ?? generateAnonymousId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const res = new NextResponse(null, { status: 204 });
    setAnonCookie(res, anonymousId);
    return res;
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const res = new NextResponse(null, { status: 204 });
    setAnonCookie(res, anonymousId);
    return res;
  }

  const event = parsed.data.event as FunnelEventName;
  if (!ALLOWED_EVENTS.has(event)) {
    const res = new NextResponse(null, { status: 204 });
    setAnonCookie(res, anonymousId);
    return res;
  }

  // Resolve user (best-effort)
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Unauthenticated landing-page traffic — that's fine.
  }

  // Currently, tenantId == userId because we are still single-Supabase-project.
  // When we move to per-tenant Supabase projects this will become the
  // tenant subdomain identifier instead.
  const tenantId = userId;

  await track(event, {
    userId,
    anonymousId: userId ? null : anonymousId,
    tenantId,
    properties: parsed.data.properties,
  });

  const response = new NextResponse(null, { status: 204 });
  // Refresh the cookie so its TTL resets on every event (only while the user
  // is unauthenticated — once they have a userId we don't need the cookie).
  if (!userId) {
    setAnonCookie(response, anonymousId);
  }
  return response;
}
