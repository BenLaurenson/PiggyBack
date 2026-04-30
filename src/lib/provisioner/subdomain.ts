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

import { randomBytes } from "crypto";

// Crockford base32 alphabet — no I/L/O/U/0/1 to avoid visual confusion
const BASE32 = "abcdefghjkmnpqrstvwxyz23456789";

/** Generate a 6-character base32 short ID. ~30^6 ≈ 730M values. */
export function generateShortId(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE32[bytes[i] % BASE32.length];
  }
  return out;
}

/**
 * DNS-safe, lowercase, 3–32 chars, starts and ends with alphanumeric.
 * Hyphens allowed in interior positions.
 */
const VANITY_REGEX = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * Words and hostnames we never hand out. Includes infrastructure, common
 * routes on piggyback.finance, the founder's and mascot names, and short
 * names that we may want for ourselves.
 */
const RESERVED_VANITY_NAMES = new Set([
  // Infrastructure
  "admin", "api", "app", "auth", "blog", "cdn", "cms", "dashboard", "dns",
  "docs", "email", "ftp", "git", "help", "host", "hosting", "imap", "io",
  "kb", "ldap", "mail", "manage", "media", "mx", "ns", "ns1", "ns2", "ops",
  "pop", "pop3", "portal", "private", "public", "secure", "smtp", "ssh",
  "ssl", "static", "status", "support", "system", "test", "vpn", "webdav",
  "webmail", "www",
  // Marketing/site routes
  "about", "billing", "blog", "careers", "contact", "demo", "download",
  "enterprise", "features", "get-started", "home", "login", "logout",
  "marketing", "onboarding", "pricing", "privacy", "roadmap", "security",
  "self-host", "selfhost", "settings", "signin", "signout", "signup", "terms",
  "thank-you", "trial",
  // Brand-specific
  "ben", "buck", "penny", "piggy", "piggyback", "piggybackfinance",
  "piggyback-finance", "hosted",
  // Operational
  "internal", "mcp", "openclaw", "production", "prod", "staging", "staging1",
  "stg", "qa", "qa1", "dev", "dev1", "preview", "release",
  // Legal / compliance
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

/**
 * 30-day cooldown between vanity changes. Returns null if allowed; otherwise
 * an error message.
 */
export function vanityChangeAllowedFrom(lastChangedAt: Date | null): string | null {
  if (!lastChangedAt) return null;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - lastChangedAt.getTime();
  if (elapsed >= thirtyDays) return null;
  const daysRemaining = Math.ceil((thirtyDays - elapsed) / (24 * 60 * 60 * 1000));
  return `You can change your subdomain again in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`;
}
