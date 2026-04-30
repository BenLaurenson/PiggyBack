/**
 * Unit tests for the Phase 3.2 subdomain helpers:
 *   - shortid generation: format, distribution, low collision rate
 *   - vanity validation: regex, reserved list, 1–2 char ban
 *   - rename rate-limit cooldown
 *   - alias expiry / redirect window logic
 */

import { describe, it, expect } from "vitest";
import {
  ALIAS_GRACE_MS,
  RENAME_COOLDOWN_MS,
  RESERVED_VANITY_NAMES,
  buildHostname,
  computeAliasExpiry,
  generateShortId,
  isAliasActive,
  validateVanityName,
  vanityChangeAllowedFrom,
} from "../subdomain";

// ─── generateShortId ────────────────────────────────────────────────────────

describe("generateShortId", () => {
  it("returns a 6-char base32 string by default", () => {
    const id = generateShortId();
    expect(id).toHaveLength(6);
    // Crockford-ish alphabet: a-z minus i,l,o,u; digits 2–9
    expect(id).toMatch(/^[abcdefghjkmnpqrstvwxyz23456789]{6}$/);
  });

  it("respects an explicit length argument", () => {
    expect(generateShortId(4)).toHaveLength(4);
    expect(generateShortId(10)).toHaveLength(10);
  });

  it("does NOT generate forbidden visually-confusable chars (i/l/o/u/0/1)", () => {
    const ids = Array.from({ length: 1000 }, () => generateShortId(8));
    for (const id of ids) {
      expect(id).not.toMatch(/[ilou01]/);
    }
  });

  it("has very low collision rate over 5,000 samples (uniqueness sanity)", () => {
    const seen = new Set<string>();
    let collisions = 0;
    for (let i = 0; i < 5000; i++) {
      const id = generateShortId();
      if (seen.has(id)) collisions++;
      seen.add(id);
    }
    // 30^6 ≈ 729M codes; 5000 samples should collide ~0 times.
    // Allow up to 2 collisions for randomness slack so the test isn't flaky.
    expect(collisions).toBeLessThanOrEqual(2);
  });
});

// ─── validateVanityName ─────────────────────────────────────────────────────

describe("validateVanityName", () => {
  it("accepts well-formed names", () => {
    for (const ok of ["benl", "ben-laurenson", "user123", "a1b2c3", "aaa"]) {
      expect(validateVanityName(ok).ok).toBe(true);
    }
  });

  it("rejects empty input", () => {
    expect(validateVanityName("").ok).toBe(false);
  });

  it("rejects too-short names (1–2 chars)", () => {
    expect(validateVanityName("a").ok).toBe(false);
    expect(validateVanityName("ab").ok).toBe(false);
  });

  it("rejects too-long names (>32 chars)", () => {
    const tooLong = "a".repeat(33);
    expect(validateVanityName(tooLong).ok).toBe(false);
  });

  it("rejects uppercase / special chars", () => {
    expect(validateVanityName("Benl").ok).toBe(false);
    expect(validateVanityName("ben_l").ok).toBe(false);
    expect(validateVanityName("ben.l").ok).toBe(false);
    expect(validateVanityName("ben l").ok).toBe(false);
  });

  it("rejects names that start or end with a hyphen", () => {
    expect(validateVanityName("-benl").ok).toBe(false);
    expect(validateVanityName("benl-").ok).toBe(false);
  });

  it("rejects every reserved name from the Phase 3.2 list", () => {
    const required = [
      "admin", "api", "app", "www", "mail", "ftp", "blog", "docs", "help",
      "support", "status", "billing", "dashboard", "login", "signup", "signin",
      "auth", "oauth", "account", "accounts",
      "ben", "penny", "buck", "piggyback", "piggy", "hosted",
      "self-host", "selfhost",
      "about", "pricing", "roadmap", "terms", "privacy", "security", "legal",
      "demo", "test", "staging", "prod", "production",
      "root", "system", "internal", "mcp", "openclaw",
    ];
    for (const name of required) {
      expect(RESERVED_VANITY_NAMES.has(name)).toBe(true);
      expect(validateVanityName(name).ok).toBe(false);
    }
  });
});

// ─── vanityChangeAllowedFrom ────────────────────────────────────────────────

describe("vanityChangeAllowedFrom (30-day rename rate limit)", () => {
  it("allows when never changed before", () => {
    expect(vanityChangeAllowedFrom(null)).toBeNull();
  });

  it("blocks within the 30-day window", () => {
    const now = new Date("2026-04-30T12:00:00Z");
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const msg = vanityChangeAllowedFrom(fiveDaysAgo, now);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/25 days/);
  });

  it("allows after exactly 30 days", () => {
    const now = new Date("2026-04-30T12:00:00Z");
    const thirty = new Date(now.getTime() - RENAME_COOLDOWN_MS);
    expect(vanityChangeAllowedFrom(thirty, now)).toBeNull();
  });

  it("allows after the window has elapsed", () => {
    const now = new Date("2026-04-30T12:00:00Z");
    const long = new Date(now.getTime() - RENAME_COOLDOWN_MS - 1000);
    expect(vanityChangeAllowedFrom(long, now)).toBeNull();
  });

  it("uses 'day' (singular) when 1 day remains", () => {
    const now = new Date("2026-04-30T12:00:00Z");
    const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const msg = vanityChangeAllowedFrom(twentyNineDaysAgo, now);
    expect(msg).toBe("You can change your subdomain again in 1 day.");
  });
});

// ─── alias expiry / redirect window ─────────────────────────────────────────

describe("computeAliasExpiry + isAliasActive", () => {
  it("computes expiry as createdAt + 30 days", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const expiry = computeAliasExpiry(created);
    expect(expiry.getTime() - created.getTime()).toBe(ALIAS_GRACE_MS);
  });

  it("isAliasActive: true while inside the window", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const expiry = computeAliasExpiry(created);
    const inside = new Date(created.getTime() + ALIAS_GRACE_MS - 1000);
    expect(isAliasActive(expiry, inside)).toBe(true);
  });

  it("isAliasActive: false at exactly the expiry instant", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const expiry = computeAliasExpiry(created);
    expect(isAliasActive(expiry, expiry)).toBe(false);
  });

  it("isAliasActive: false after the window", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const expiry = computeAliasExpiry(created);
    const after = new Date(expiry.getTime() + 60_000);
    expect(isAliasActive(expiry, after)).toBe(false);
  });
});

// ─── buildHostname ──────────────────────────────────────────────────────────

describe("buildHostname", () => {
  it("appends .piggyback.finance", () => {
    expect(buildHostname("benl")).toBe("benl.piggyback.finance");
    expect(buildHostname("j7k2p9")).toBe("j7k2p9.piggyback.finance");
  });
});
