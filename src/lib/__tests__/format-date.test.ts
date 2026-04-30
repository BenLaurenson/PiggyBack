import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  resolveTimezone,
  DEFAULT_TIMEZONE,
} from "@/lib/format-date";

describe("format-date helpers", () => {
  describe("resolveTimezone", () => {
    it("falls back to AEST/AEDT default when timezone is null", () => {
      expect(resolveTimezone(null)).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimezone("")).toBe(DEFAULT_TIMEZONE);
    });

    it("accepts Australian IANA zones", () => {
      expect(resolveTimezone("Australia/Perth")).toBe("Australia/Perth");
      expect(resolveTimezone("Australia/Adelaide")).toBe("Australia/Adelaide");
      expect(resolveTimezone("Australia/Brisbane")).toBe("Australia/Brisbane");
    });

    it("falls back when the timezone is not a real IANA zone", () => {
      expect(resolveTimezone("Not/Real")).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimezone("garbage")).toBe(DEFAULT_TIMEZONE);
    });
  });

  describe("formatDate / formatDateTime — base behaviour", () => {
    it("returns empty string for null/undefined/invalid", () => {
      expect(formatDate(null)).toBe("");
      expect(formatDate(undefined)).toBe("");
      expect(formatDate("")).toBe("");
      expect(formatDate("not-a-date")).toBe("");
      expect(formatDateTime(null)).toBe("");
      expect(formatDateTime("not-a-date")).toBe("");
    });

    it("renders a UTC instant in AEST/AEDT by default", () => {
      // 2026-04-01T00:00:00Z falls inside AEST (UTC+10), so AU local date is 1 April.
      const result = formatDate("2026-04-01T00:00:00Z");
      expect(result).toContain("April");
      expect(result).toContain("2026");
    });
  });

  describe("DST boundary handling", () => {
    // Australian DST in 2025/2026:
    //   AEDT starts 5 Oct 2025 02:00 (clocks forward → 03:00). Until then = AEST (UTC+10).
    //   AEDT ends   5 Apr 2026 03:00 (clocks back   → 02:00). After that  = AEST (UTC+10).
    //
    // Perth is AWST year-round (UTC+8, no DST).

    it("renders an instant just before AEDT->AEST switch (autumn boundary) in AEDT", () => {
      // 2026-04-04T15:30:00Z is 5 Apr 2026 02:30 AEDT (still daylight time)
      // and 5 Apr 2026 01:30 AEST. We want "still in AEDT" — 02:30.
      const result = formatTime("2026-04-04T15:30:00Z", { timezone: "Australia/Melbourne" });
      expect(result).toBe("02:30");
    });

    it("renders an instant just after AEDT->AEST switch (autumn boundary) in AEST", () => {
      // 2026-04-04T17:00:00Z is 5 Apr 2026 03:00 AEST (DST has ended; UTC+10).
      const result = formatTime("2026-04-04T17:00:00Z", { timezone: "Australia/Melbourne" });
      expect(result).toBe("03:00");
    });

    it("renders an instant inside the AEST->AEDT spring forward boundary", () => {
      // 2025-10-04T16:00:00Z = 5 Oct 2025 03:00 AEDT (just after spring forward).
      const result = formatTime("2025-10-04T16:00:00Z", { timezone: "Australia/Melbourne" });
      expect(result).toBe("03:00");
    });

    it("renders the same instant differently for AEDT vs AWST (Perth)", () => {
      // 2026-01-15T00:00:00Z (peak Australian summer; AEDT is in effect)
      // Melbourne (AEDT, UTC+11) = 11:00 same day
      // Perth (AWST, UTC+8) = 08:00 same day
      const melb = formatTime("2026-01-15T00:00:00Z", { timezone: "Australia/Melbourne" });
      const perth = formatTime("2026-01-15T00:00:00Z", { timezone: "Australia/Perth" });
      expect(melb).toBe("11:00");
      expect(perth).toBe("08:00");
    });

    it("renders the same instant correctly for ACDT vs AWST in summer", () => {
      // 2026-01-15T12:00:00Z
      // Adelaide (ACDT, UTC+10:30) = 22:30
      // Perth (AWST, UTC+8) = 20:00
      const adl = formatTime("2026-01-15T12:00:00Z", { timezone: "Australia/Adelaide" });
      const perth = formatTime("2026-01-15T12:00:00Z", { timezone: "Australia/Perth" });
      expect(adl).toBe("22:30");
      expect(perth).toBe("20:00");
    });

    it("Brisbane stays at AEST year-round (no DST)", () => {
      // Pick a winter and a summer instant; Brisbane offset stays UTC+10.
      const winter = formatTime("2026-06-15T00:00:00Z", { timezone: "Australia/Brisbane" });
      const summer = formatTime("2026-01-15T00:00:00Z", { timezone: "Australia/Brisbane" });
      // 2026-06-15T00:00:00Z = 10:00 in Brisbane (AEST UTC+10)
      // 2026-01-15T00:00:00Z = 10:00 in Brisbane (AEST UTC+10, no DST)
      expect(winter).toBe("10:00");
      expect(summer).toBe("10:00");
    });
  });

  describe("formatDateTime", () => {
    it("includes both date and time", () => {
      // 2026-06-01T00:00:00Z = 1 June 2026 10:00 AEST (winter, no DST, UTC+10)
      const result = formatDateTime("2026-06-01T00:00:00Z", {
        timezone: "Australia/Melbourne",
      });
      expect(result).toContain("June");
      expect(result).toContain("2026");
      expect(result).toContain("10:00");
    });

    it("respects format option", () => {
      const long = formatDateTime("2026-06-01T00:00:00Z", {
        timezone: "Australia/Melbourne",
        format: "long",
      });
      // Long format includes weekday — 1 June 2026 is a Monday.
      expect(long).toMatch(/Monday/);
    });

    it("includes seconds when requested", () => {
      const result = formatDateTime("2026-04-01T00:00:42Z", {
        timezone: "Australia/Melbourne",
        includeSeconds: true,
      });
      expect(result).toContain(":42");
    });
  });
});
