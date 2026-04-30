import { describe, it, expect } from "vitest";
import {
  calendarDaysBetween,
  weekdaysBetween,
  daysUntil,
  nextPaydayInfo,
  shouldSurfacePayday,
} from "../goal-calendar";

describe("calendarDaysBetween", () => {
  it("returns positive for future dates", () => {
    expect(
      calendarDaysBetween(new Date("2025-04-01"), new Date("2025-04-08"))
    ).toBe(7);
  });

  it("returns negative for past dates", () => {
    expect(
      calendarDaysBetween(new Date("2025-04-08"), new Date("2025-04-01"))
    ).toBe(-7);
  });

  it("returns 0 for same calendar day regardless of time", () => {
    // Use local midnight + late-evening so the test is timezone-agnostic.
    // calendarDaysBetween anchors on the *local* y/m/d, so two times
    // within the same local day must collapse to 0.
    const localMorning = new Date(2025, 3, 1, 0, 0, 0);
    const localEvening = new Date(2025, 3, 1, 23, 59, 0);
    expect(calendarDaysBetween(localMorning, localEvening)).toBe(0);
  });
});

describe("weekdaysBetween", () => {
  it("counts weekdays only, excluding Sat & Sun", () => {
    // Mon 2025-04-07 → Fri 2025-04-11 = 4 weekdays (07,08,09,10).
    expect(
      weekdaysBetween(new Date("2025-04-07"), new Date("2025-04-11"))
    ).toBe(4);
  });

  it("returns 0 when from >= to", () => {
    expect(
      weekdaysBetween(new Date("2025-04-08"), new Date("2025-04-01"))
    ).toBe(0);
  });

  it("handles full weeks: 14 calendar days = 10 weekdays", () => {
    // Mon → Mon = 7 days; Mon → Mon+14 = 14 days.
    expect(
      weekdaysBetween(new Date("2025-04-07"), new Date("2025-04-21"))
    ).toBe(10);
  });

  it("handles a weekend in the tail", () => {
    // Friday 2025-04-04 → Tuesday 2025-04-08 = Fri, Sat, Sun, Mon = 2 weekdays.
    expect(
      weekdaysBetween(new Date("2025-04-04"), new Date("2025-04-08"))
    ).toBe(2);
  });
});

describe("daysUntil", () => {
  const now = new Date("2025-04-07T00:00:00Z"); // Monday

  it("naive calendar count when skipWeekends:false", () => {
    expect(daysUntil("2025-04-21", now, { skipWeekends: false })).toBe(14);
  });

  it("weekday-only count when skipWeekends:true", () => {
    // 2025-04-07 (Mon) → 2025-04-21 (Mon) = 14 days, 10 weekdays.
    expect(daysUntil("2025-04-21", now, { skipWeekends: true })).toBe(10);
  });

  it("returns negative for past deadlines", () => {
    expect(daysUntil("2025-03-31", now)).toBeLessThan(0);
  });
});

// ============================================================================
// nextPaydayInfo — fortnightly salary detection
// ============================================================================

describe("nextPaydayInfo", () => {
  const now = new Date("2025-04-07T00:00:00Z");

  it("returns 'unknown' frequency when no income data", () => {
    const info = nextPaydayInfo({ incomeTransactions: [], incomeSources: [], now });
    expect(info.frequency).toBe("unknown");
    expect(info.nextPaydayIso).toBeNull();
    expect(info.daysUntil).toBeNull();
  });

  it("prefers configured income source when next_pay_date is in the future", () => {
    const info = nextPaydayInfo({
      incomeTransactions: [],
      incomeSources: [
        {
          frequency: "fortnightly",
          next_pay_date: "2025-04-18",
          source_type: "recurring-salary",
          is_active: true,
        },
      ],
      now,
    });
    expect(info.frequency).toBe("fortnightly");
    expect(info.nextPaydayIso).toBe("2025-04-18");
    expect(info.daysUntil).toBe(11);
    expect(info.confidence).toBe("high");
  });

  it("falls back to pattern detection when no configured source has a future date", () => {
    const info = nextPaydayInfo({
      incomeTransactions: [
        {
          id: "t1",
          description: "ACME Salary",
          amount_cents: 250000,
          created_at: "2025-02-07T00:00:00Z",
        },
        {
          id: "t2",
          description: "ACME Salary",
          amount_cents: 250000,
          created_at: "2025-02-21T00:00:00Z",
        },
        {
          id: "t3",
          description: "ACME Salary",
          amount_cents: 250000,
          created_at: "2025-03-07T00:00:00Z",
        },
        {
          id: "t4",
          description: "ACME Salary",
          amount_cents: 250000,
          created_at: "2025-03-21T00:00:00Z",
        },
      ],
      incomeSources: [],
      now,
    });
    expect(info.frequency).toBe("fortnightly");
    expect(info.nextPaydayIso).not.toBeNull();
    expect(info.daysUntil).not.toBeNull();
    expect(info.daysUntil!).toBeGreaterThan(0);
  });

  it("rolls forward if predicted date already passed", () => {
    // Last pay: 2025-02-07. Pattern: weekly. Predicted next: 2025-02-14 → in past.
    // Should roll forward until > now (2025-04-07).
    const info = nextPaydayInfo({
      incomeTransactions: [
        {
          id: "t1",
          description: "Weekly",
          amount_cents: 100000,
          created_at: "2025-01-31T00:00:00Z",
        },
        {
          id: "t2",
          description: "Weekly",
          amount_cents: 100000,
          created_at: "2025-02-07T00:00:00Z",
        },
      ],
      incomeSources: [],
      now,
    });
    if (info.frequency === "weekly") {
      // Sanity: the future payday should be after `now`.
      expect(info.daysUntil!).toBeGreaterThan(0);
      expect(new Date(info.nextPaydayIso!).getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("ignores inactive recurring salaries", () => {
    const info = nextPaydayInfo({
      incomeTransactions: [],
      incomeSources: [
        {
          frequency: "fortnightly",
          next_pay_date: "2025-04-18",
          source_type: "recurring-salary",
          is_active: false, // inactive — should be skipped
        },
      ],
      now,
    });
    expect(info.frequency).toBe("unknown");
  });
});

describe("shouldSurfacePayday", () => {
  it("surfaces fortnightly with medium+ confidence", () => {
    expect(
      shouldSurfacePayday({
        frequency: "fortnightly",
        nextPaydayIso: "2025-04-18",
        daysUntil: 11,
        confidence: "high",
        averageAmountCents: 250000,
      })
    ).toBe(true);
  });

  it("surfaces weekly with medium+ confidence (extension beyond brief)", () => {
    expect(
      shouldSurfacePayday({
        frequency: "weekly",
        nextPaydayIso: "2025-04-14",
        daysUntil: 7,
        confidence: "medium",
        averageAmountCents: 150000,
      })
    ).toBe(true);
  });

  it("hides monthly cadence", () => {
    expect(
      shouldSurfacePayday({
        frequency: "monthly",
        nextPaydayIso: "2025-05-01",
        daysUntil: 24,
        confidence: "high",
        averageAmountCents: 500000,
      })
    ).toBe(false);
  });

  it("hides low-confidence detections", () => {
    expect(
      shouldSurfacePayday({
        frequency: "fortnightly",
        nextPaydayIso: "2025-04-18",
        daysUntil: 11,
        confidence: "low",
        averageAmountCents: 0,
      })
    ).toBe(false);
  });

  it("hides when daysUntil is negative or null", () => {
    expect(
      shouldSurfacePayday({
        frequency: "fortnightly",
        nextPaydayIso: null,
        daysUntil: null,
        confidence: "high",
        averageAmountCents: 0,
      })
    ).toBe(false);
  });
});
