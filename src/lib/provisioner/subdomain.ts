/**
 * Subdomain assignment for *.piggyback.finance.
 *
 * Default: opaque 6-character base32 short ID assigned at signup. Stable, no
 * collisions, no support tickets about "can I have ben?".
 *
 * Vanity upgrade: optional user-chosen name, validated against a reserved list
 * and rate-limited to one change per 30 days. The old subdomain 301-redirects
 * for 30 days after a vanity change to avoid breaking shared links.
 */

// Re-export the Node-only shortid generator so existing import sites keep
// working. Edge code (middleware) only ever needs the validators and pure
// helpers below, not the generator.
export { generateShortId } from "./short-id";

/**
 * DNS-safe, lowercase, 3–32 chars, starts and ends with alphanumeric.
 * Hyphens allowed in interior positions.
 */
const VANITY_REGEX = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * Words and hostnames we never hand out. Includes infrastructure, common
 * routes on piggyback.finance, the founder's and mascot names, and short
 * names that we may want for ourselves. The Phase 3.2 plan in
 * docs/subdomain-system.md enumerates the canonical baseline; we keep a few
 * extras here (mail aliases, DNS service names, etc.) for safety.
 */
export const RESERVED_VANITY_NAMES = new Set([
  // ── Infrastructure / DNS / mail ───────────────────────────────────────────
  "admin", "api", "app", "auth", "blog", "cdn", "cms", "dashboard", "dns",
  "docs", "email", "ftp", "git", "help", "host", "hosting", "imap", "io",
  "kb", "ldap", "mail", "manage", "media", "mx", "ns", "ns1", "ns2", "ops",
  "pop", "pop3", "portal", "private", "public", "secure", "smtp", "ssh",
  "ssl", "static", "status", "support", "system", "test", "vpn", "webdav",
  "webmail", "www",
  // ── Marketing / site routes ───────────────────────────────────────────────
  "about", "account", "accounts", "billing", "careers", "contact", "demo",
  "download", "enterprise", "features", "get-started", "home", "login",
  "logout", "marketing", "oauth", "onboarding", "pricing", "privacy",
  "roadmap", "security", "self-host", "selfhost", "settings", "signin",
  "signout", "signup", "terms", "thank-you", "trial",
  // ── Brand / mascots / founder ─────────────────────────────────────────────
  "ben", "buck", "hosted", "penny", "piggy", "piggyback", "piggybackfinance",
  "piggyback-finance",
  // ── Operational / environments ────────────────────────────────────────────
  "dev", "dev1", "internal", "mcp", "openclaw", "preview", "prod",
  "production", "qa", "qa1", "release", "staging", "staging1", "stg",
  // ── Legal / compliance / abuse ────────────────────────────────────────────
  "abuse", "compliance", "legal", "noreply", "no-reply", "postmaster",
  "robots", "root", "spam", "sysadmin", "webmaster",
]);

export interface VanityValidation {
  ok: boolean;
  /** A human-readable reason, suitable for inline form errors. */
  reason?: string;
}

export function validateVanityName(name: string): VanityValidation {
  if (!name) return { ok: false, reason: "Choose a subdomain name." };
  if (name.length < 3) return { ok: false, reason: "Must be at least 3 characters." };
  if (name.length > 32) return { ok: false, reason: "Must be 32 characters or fewer." };
  if (!VANITY_REGEX.test(name)) {
    return {
      ok: false,
      reason:
        "Use lowercase letters, digits, and hyphens only. Must start and end with a letter or digit.",
    };
  }
  if (RESERVED_VANITY_NAMES.has(name)) {
    return { ok: false, reason: "That subdomain is reserved." };
  }
  // Reserve all single- and two-character names; we'll hand them out manually
  // if anyone genuinely needs them.
  if (name.length <= 2) {
    return { ok: false, reason: "Single- and two-character names are reserved." };
  }
  return { ok: true };
}

export function buildHostname(subdomain: string): string {
  return `${subdomain}.piggyback.finance`;
}

/** 30-day cooldown between vanity changes (used by `vanityChangeAllowedFrom`). */
export const RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** 30-day grace window during which the old subdomain 301-redirects to the new one. */
export const ALIAS_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 30-day cooldown between vanity changes. Returns null if allowed; otherwise
 * an error message describing how long the user has to wait.
 *
 * Pure function so it tests cleanly with a `now` injection.
 */
export function vanityChangeAllowedFrom(
  lastChangedAt: Date | null,
  now: Date = new Date()
): string | null {
  if (!lastChangedAt) return null;
  const elapsed = now.getTime() - lastChangedAt.getTime();
  if (elapsed >= RENAME_COOLDOWN_MS) return null;
  const daysRemaining = Math.ceil((RENAME_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
  return `You can change your subdomain again in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`;
}

/**
 * Compute the alias expiry timestamp for an alias created at `createdAt`.
 * Pure helper, exported for tests.
 */
export function computeAliasExpiry(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + ALIAS_GRACE_MS);
}

/**
 * True if the alias should still serve a 301 redirect at `now`.
 * Used by middleware to decide redirect-vs-404 for old subdomains.
 */
export function isAliasActive(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() > now.getTime();
}
