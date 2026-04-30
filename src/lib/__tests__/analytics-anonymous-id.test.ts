import { describe, it, expect } from "vitest";
import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_MAX_AGE_SECONDS,
  generateAnonymousId,
  readAnonymousIdFromHeader,
} from "@/lib/analytics/anonymous-id";

describe("analytics/anonymous-id", () => {
  it("uses the documented cookie name", () => {
    expect(ANONYMOUS_ID_COOKIE).toBe("pb_aid");
  });

  it("has a 30-day TTL", () => {
    expect(ANONYMOUS_ID_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it("generates RFC4122 v4 UUIDs", () => {
    const id = generateAnonymousId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates unique values across calls", () => {
    const a = generateAnonymousId();
    const b = generateAnonymousId();
    expect(a).not.toBe(b);
  });

  describe("readAnonymousIdFromHeader", () => {
    it("returns null when header is null/undefined", () => {
      expect(readAnonymousIdFromHeader(null)).toBeNull();
      expect(readAnonymousIdFromHeader(undefined)).toBeNull();
    });

    it("returns null when cookie is absent", () => {
      expect(readAnonymousIdFromHeader("foo=bar; baz=qux")).toBeNull();
    });

    it("extracts the cookie value when present", () => {
      const id = generateAnonymousId();
      expect(readAnonymousIdFromHeader(`other=1; pb_aid=${id}; another=2`)).toBe(id);
    });

    it("returns null for empty cookie value", () => {
      expect(readAnonymousIdFromHeader("pb_aid=")).toBeNull();
    });

    it("handles cookies with extra whitespace", () => {
      const id = generateAnonymousId();
      expect(readAnonymousIdFromHeader(`  pb_aid=${id}  ;  other=foo  `)).toBe(id);
    });
  });
});
