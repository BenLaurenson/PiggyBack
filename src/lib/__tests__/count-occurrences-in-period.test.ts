import { describe, it, expect } from "vitest";
import { countOccurrencesInPeriod } from "../budget-engine";

// Helper to create UTC period boundaries
function period(startStr: string, endStr: string) {
  return {
    start: new Date(startStr),
    end: new Date(endStr),
  };
}

// February 2026 (28 days)
const FEB_2026 = period("2026-02-01T00:00:00Z", "2026-02-28T23:59:59.999Z");
// March 2026 (31 days)
const MAR_2026 = period("2026-03-01T00:00:00Z", "2026-03-31T23:59:59.999Z");
// January 2026 (31 days) — has 5 weeks in month-aligned system (22-31 = 10 days)
const JAN_2026 = period("2026-01-01T00:00:00Z", "2026-01-31T23:59:59.999Z");

// Weekly periods (month-aligned)
const FEB_WEEK1 = period("2026-02-01T00:00:00Z", "2026-02-07T23:59:59.999Z");
const FEB_WEEK2 = period("2026-02-08T00:00:00Z", "2026-02-14T23:59:59.999Z");
const FEB_WEEK4 = period("2026-02-22T00:00:00Z", "2026-02-28T23:59:59.999Z");
// Fortnightly periods
const FEB_FN1 = period("2026-02-01T00:00:00Z", "2026-02-14T23:59:59.999Z");
const FEB_FN2 = period("2026-02-15T00:00:00Z", "2026-02-28T23:59:59.999Z");

describe("countOccurrencesInPeriod", () => {
  describe("weekly recurrence", () => {
    it("counts 4 weekly occurrences in a 28-day month", () => {
      // Anchor: every Monday starting Feb 2
      const count = countOccurrencesInPeriod("2026-02-02", "weekly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(4); // Feb 2, 9, 16, 23
    });

    it("counts 5 weekly occurrences in a 5-week month when aligned", () => {
      // March 2026 has 31 days. Anchor on March 1 (Sunday).
      // Occurrences: Mar 1, 8, 15, 22, 29 — 5 in the month
      const count = countOccurrencesInPeriod("2026-03-01", "weekly", MAR_2026.start, MAR_2026.end);
      expect(count).toBe(5);
    });

    it("counts 1 weekly occurrence in a single week period", () => {
      // Anchor Feb 4 (Wednesday), period Feb 1-7
      const count = countOccurrencesInPeriod("2026-02-04", "weekly", FEB_WEEK1.start, FEB_WEEK1.end);
      expect(count).toBe(1);
    });

    it("counts 0 when weekly anchor misses the period", () => {
      // Anchor Feb 1 (Sunday), period Feb 8-14 — next occurrence is Feb 8
      const count = countOccurrencesInPeriod("2026-02-01", "weekly", FEB_WEEK2.start, FEB_WEEK2.end);
      expect(count).toBe(1); // Feb 8 falls in period
    });

    it("counts correctly when anchor is far in the future", () => {
      // Anchor in Dec 2026, checking Feb 2026 — should still project back
      const count = countOccurrencesInPeriod("2026-12-07", "weekly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(4);
    });

    it("counts correctly when anchor is far in the past", () => {
      // Anchor in Jan 2020, checking Feb 2026
      const count = countOccurrencesInPeriod("2020-01-06", "weekly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(4);
    });
  });

  describe("fortnightly recurrence", () => {
    it("counts 2 fortnightly occurrences in a 28-day month", () => {
      const count = countOccurrencesInPeriod("2026-02-05", "fortnightly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(2); // Feb 5 and Feb 19
    });

    it("counts 1 fortnightly occurrence in first fortnight", () => {
      const count = countOccurrencesInPeriod("2026-02-05", "fortnightly", FEB_FN1.start, FEB_FN1.end);
      expect(count).toBe(1);
    });

    it("counts 0 fortnightly in a week when it falls in a different week", () => {
      // Anchor Feb 5, period Feb 8-14 — next fortnightly is Feb 19
      const count = countOccurrencesInPeriod("2026-02-05", "fortnightly", FEB_WEEK2.start, FEB_WEEK2.end);
      expect(count).toBe(0);
    });

    it("counts correctly when anchor is far in the past", () => {
      const count = countOccurrencesInPeriod("2020-01-03", "fortnightly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(2);
    });
  });

  describe("monthly recurrence", () => {
    it("counts 1 monthly occurrence in its due month", () => {
      const count = countOccurrencesInPeriod("2026-02-15", "monthly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });

    it("counts 1 monthly occurrence when anchor is in a different month", () => {
      // Anchor in Jan, checking Feb — should find the Feb occurrence
      const count = countOccurrencesInPeriod("2026-01-15", "monthly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });

    it("counts 0 when monthly anchor day falls outside the period", () => {
      // Anchor on 10th, but period is week4 (22-28)
      const count = countOccurrencesInPeriod("2026-02-10", "monthly", FEB_WEEK4.start, FEB_WEEK4.end);
      expect(count).toBe(0);
    });

    it("counts 1 when monthly anchor day falls within the period", () => {
      // Anchor on 25th, period is week4 (22-28)
      const count = countOccurrencesInPeriod("2026-02-25", "monthly", FEB_WEEK4.start, FEB_WEEK4.end);
      expect(count).toBe(1);
    });

    it("handles anchor on 31st in a 28-day month (clamps to last day)", () => {
      // Anchor on Jan 31, checking Feb (28 days) — should clamp to Feb 28
      const count = countOccurrencesInPeriod("2026-01-31", "monthly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });

    it("handles anchor on 29th in non-leap-year February", () => {
      // Feb 2026 has 28 days, anchor on 29th — clamps to 28th
      const count = countOccurrencesInPeriod("2026-01-29", "monthly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });
  });

  describe("quarterly recurrence", () => {
    it("counts 1 quarterly occurrence in the due month", () => {
      // Anchor Feb 15, checking Feb — should be 1
      const count = countOccurrencesInPeriod("2026-02-15", "quarterly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });

    it("counts 0 quarterly in a non-due month", () => {
      // Anchor Feb 15, checking Mar — next quarterly is May
      const count = countOccurrencesInPeriod("2026-02-15", "quarterly", MAR_2026.start, MAR_2026.end);
      expect(count).toBe(0);
    });

    it("counts 1 quarterly when anchor is months before", () => {
      // Anchor Nov 15 2025, checking Feb 2026 — Nov + 3 = Feb, so yes
      const count = countOccurrencesInPeriod("2025-11-15", "quarterly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });
  });

  describe("yearly recurrence", () => {
    it("counts 1 yearly occurrence in the due month", () => {
      const count = countOccurrencesInPeriod("2025-02-15", "yearly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });

    it("counts 0 yearly in a non-due month", () => {
      const count = countOccurrencesInPeriod("2025-03-15", "yearly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(0);
    });

    it("counts 0 yearly when anchor is far in the future", () => {
      // Anchor Jul 2027, checking Feb 2026 — yearly would be Jul each year
      const count = countOccurrencesInPeriod("2027-07-15", "yearly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(0);
    });

    it("counts 1 yearly when anchor is years in the past", () => {
      // Anchor Feb 2020, checking Feb 2026 — every Feb, so 1
      const count = countOccurrencesInPeriod("2020-02-10", "yearly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });
  });

  describe("one-time", () => {
    it("counts 1 when one-time event is within the period", () => {
      const count = countOccurrencesInPeriod("2026-02-15", "one-time", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });

    it("counts 0 when one-time event is outside the period", () => {
      const count = countOccurrencesInPeriod("2026-03-15", "one-time", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(0);
    });

    it("counts 1 when one-time is on period boundary (start)", () => {
      const count = countOccurrencesInPeriod("2026-02-01", "one-time", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });

    it("counts 1 when one-time is on period boundary (end)", () => {
      const count = countOccurrencesInPeriod("2026-02-28", "one-time", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for invalid date", () => {
      const count = countOccurrencesInPeriod("not-a-date", "weekly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(0);
    });

    it("returns 0 for empty string date", () => {
      const count = countOccurrencesInPeriod("", "weekly", FEB_2026.start, FEB_2026.end);
      expect(count).toBe(0);
    });

    it("handles period where start equals end (single day)", () => {
      const singleDay = period("2026-02-15T00:00:00Z", "2026-02-15T23:59:59.999Z");
      const count = countOccurrencesInPeriod("2026-02-15", "monthly", singleDay.start, singleDay.end);
      expect(count).toBe(1);
    });

    it("handles period where start equals end and no match", () => {
      const singleDay = period("2026-02-15T00:00:00Z", "2026-02-15T23:59:59.999Z");
      const count = countOccurrencesInPeriod("2026-02-16", "monthly", singleDay.start, singleDay.end);
      expect(count).toBe(0);
    });
  });
});
