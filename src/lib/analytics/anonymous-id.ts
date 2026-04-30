/**
 * Anonymous session ID for the provisioning funnel.
 *
 * The provisioning funnel events on piggyback.finance fire before the user
 * has a Supabase account. To still be able to chain events together (and
 * stitch them to the user once tenant_ready fires), we set a cookie on
 * first landing and reuse it for every event up to tenant_ready.
 *
 * Cookie name: pb_aid
 * Lifetime: 30 days (matches PostHog's default cookie lifetime)
 * Same-site: lax (we want it readable on cross-subdomain navigation, but not
 *            sent on cross-site requests)
 */

export const ANONYMOUS_ID_COOKIE = "pb_aid";
export const ANONYMOUS_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Generate a new anonymous-id cookie value. */
export function generateAnonymousId(): string {
  return crypto.randomUUID();
}

/**
 * Read the cookie from a Cookie header string. Returns null if absent.
 * Works in both Next.js server runtimes and browser-side code.
 */
export function readAnonymousIdFromHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const c of cookies) {
    const [name, ...rest] = c.split("=");
    if (name === ANONYMOUS_ID_COOKIE) {
      return rest.join("=") || null;
    }
  }
  return null;
}
