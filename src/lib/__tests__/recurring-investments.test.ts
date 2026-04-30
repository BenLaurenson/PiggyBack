import { describe, it, expect } from "vitest";
import {
  computeNextDueDate,
  contributionVsGrowth,
  transactionMatchesPattern,
  FREQUENCY_LABEL,
} from "../recurring-investments";

describe("computeNextDueDate", () => {
  it("returns anchor unchanged when anchor is in the future", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    expect(computeNextDueDate("2026-05-15", "fortnightly", now)).toBe(
      "2026-05-15"
    );
  });

  it("walks forward fortnightly past the anchor", () => {
    const now = new Date("2026-04-30T00:00:00Z");
    // anchor: 2026-04-01 → +14 → 04-15 → +14 → 04-29 → +14 → 05-13
    // first date >= 2026-04-30 is 2026-05-13
    expect(computeNextDueDate("2026-04-01", "fortnightly", now)).toBe(
      "2026-05-13"
    );
  });

  it("handles weekly", () => {
    const now = new Date("2026-04-30T00:00:00Z");
    // 2026-04-01 → +7 → 04-08 → 04-15 → 04-22 → 04-29 → 05-06
    expect(computeNextDueDate("2026-04-01", "weekly", now)).toBe("2026-05-06");
  });

  it("handles monthly", () => {
    const now = new Date("2026-04-30T00:00:00Z");
    expect(computeNextDueDate("2026-01-15", "monthly", now)).toBe("2026-05-15");
  });

  it("handles quarterly", () => {
    const now = new Date("2026-04-30T00:00:00Z");
    // 2026-01-01 + 3mo = 2026-04-01; +3mo = 2026-07-01 (first >= 04-30)
    expect(computeNextDueDate("2026-01-01", "quarterly", now)).toBe(
      "2026-07-01"
    );
  });

  it("handles yearly", () => {
    const now = new Date("2026-04-30T00:00:00Z");
    expect(computeNextDueDate("2024-06-01", "yearly", now)).toBe("2026-06-01");
  });

  it("falls back to monthly for an unknown frequency", () => {
    const now = new Date("2026-04-30T00:00:00Z");
    // unknown → monthly default; 2026-01-15 → 02-15 → 03-15 → 04-15 → 05-15
    expect(computeNextDueDate("2026-01-15", "bogus", now)).toBe("2026-05-15");
  });

  it("caps iterations to avoid infinite loop on degenerate input", () => {
    const now = new Date("2030-01-01T00:00:00Z");
    // Sanity: the call must terminate; we don't assert the exact date.
    const out = computeNextDueDate("1900-01-01", "yearly", now);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("contributionVsGrowth", () => {
  it("sums contributions and computes growth", () => {
    const r = contributionVsGrowth([10_000, 20_000, 30_000], 80_000);
    expect(r.contributedCents).toBe(60_000);
    expect(r.growthCents).toBe(20_000);
  });

  it("clamps negative growth to zero (price not refreshed)", () => {
    const r = contributionVsGrowth([10_000, 20_000], 5_000);
    expect(r.contributedCents).toBe(30_000);
    expect(r.growthCents).toBe(0);
  });

  it("handles empty contribution list", () => {
    const r = contributionVsGrowth([], 50_000);
    expect(r.contributedCents).toBe(0);
    expect(r.growthCents).toBe(50_000);
  });
});

describe("transactionMatchesPattern", () => {
  it("does case-insensitive substring match", () => {
    expect(transactionMatchesPattern("PEARLER PTY LTD", "pearler")).toBe(true);
    expect(transactionMatchesPattern("Pearler Pty Ltd", "PEARLER")).toBe(true);
  });

  it("returns false for null/undefined description", () => {
    expect(transactionMatchesPattern(null, "pearler")).toBe(false);
    expect(transactionMatchesPattern(undefined, "pearler")).toBe(false);
  });

  it("returns false for empty pattern", () => {
    expect(transactionMatchesPattern("PEARLER PTY LTD", "")).toBe(false);
  });

  it("trims whitespace from the pattern", () => {
    expect(transactionMatchesPattern("PEARLER PTY LTD", "  pearler  ")).toBe(
      true
    );
  });
});

describe("FREQUENCY_LABEL", () => {
  it("provides a display label for every supported frequency", () => {
    expect(FREQUENCY_LABEL.weekly).toBe("Weekly");
    expect(FREQUENCY_LABEL.fortnightly).toBe("Fortnightly");
    expect(FREQUENCY_LABEL.monthly).toBe("Monthly");
    expect(FREQUENCY_LABEL.quarterly).toBe("Quarterly");
    expect(FREQUENCY_LABEL.yearly).toBe("Yearly");
  });
});
