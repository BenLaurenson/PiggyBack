import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  aggregateGoalHistory,
  aggregateSingleGoalHistory,
  calculateSavingsRate,
  calculateProjectedCompletion,
  classifyGoalStatus,
  getStartDateForPeriod,
  calculateSuggestedSavings,
} from "../goal-calculations";
import type { GoalContribution, GoalForCalculation } from "../goal-calculations";

// ============================================================================
// Helpers
// ============================================================================

function makeGoal(overrides: Partial<GoalForCalculation> = {}): GoalForCalculation {
  return {
    id: "goal-1",
    name: "Test Goal",
    icon: "piggy-bank",
    color: "#8884d8",
    current_amount_cents: 50000,
    target_amount_cents: 100000,
    deadline: null,
    is_completed: false,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<GoalContribution> = {}
): GoalContribution {
  return {
    id: "contrib-1",
    goal_id: "goal-1",
    amount_cents: 10000,
    balance_after_cents: 10000,
    source: "manual",
    created_at: "2025-02-01T00:00:00Z",
    ...overrides,
  };
}

// ============================================================================
// aggregateGoalHistory
// ============================================================================

describe("aggregateGoalHistory", () => {
  it("returns empty array for no goals", () => {
    const result = aggregateGoalHistory(
      [],
      [],
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );
    expect(result).toEqual([]);
  });

  it("aggregates single goal contributions", () => {
    const goals = [makeGoal()];
    const contributions = [
      makeContribution({
        id: "c1",
        created_at: "2025-01-15T00:00:00Z",
        amount_cents: 20000,
        balance_after_cents: 20000,
      }),
      makeContribution({
        id: "c2",
        created_at: "2025-02-15T00:00:00Z",
        amount_cents: 15000,
        balance_after_cents: 35000,
      }),
      makeContribution({
        id: "c3",
        created_at: "2025-03-15T00:00:00Z",
        amount_cents: 15000,
        balance_after_cents: 50000,
      }),
    ];

    const result = aggregateGoalHistory(
      goals,
      contributions,
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );

    expect(result.length).toBeGreaterThan(0);

    const jan15 = result.find((p) => p.date === "2025-01-15");
    expect(jan15).toBeDefined();
    expect(jan15!.valueCents).toBe(20000);

    const mar15 = result.find((p) => p.date === "2025-03-15");
    expect(mar15).toBeDefined();
    expect(mar15!.valueCents).toBe(50000);
  });

  it("aggregates multiple goals with forward-fill", () => {
    const goals = [
      makeGoal({ id: "g1", current_amount_cents: 30000 }),
      makeGoal({ id: "g2", current_amount_cents: 20000 }),
    ];
    const contributions = [
      makeContribution({
        id: "c1",
        goal_id: "g1",
        created_at: "2025-01-10T00:00:00Z",
        balance_after_cents: 10000,
      }),
      makeContribution({
        id: "c2",
        goal_id: "g2",
        created_at: "2025-01-10T00:00:00Z",
        balance_after_cents: 5000,
      }),
      makeContribution({
        id: "c3",
        goal_id: "g1",
        created_at: "2025-02-10T00:00:00Z",
        balance_after_cents: 20000,
      }),
      // g2 has no update on Feb 10 — should forward-fill 5000
    ];

    const result = aggregateGoalHistory(
      goals,
      contributions,
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );

    const jan10 = result.find((p) => p.date === "2025-01-10");
    expect(jan10).toBeDefined();
    expect(jan10!.valueCents).toBe(15000); // 10000 + 5000

    const feb10 = result.find((p) => p.date === "2025-02-10");
    expect(feb10).toBeDefined();
    expect(feb10!.valueCents).toBe(25000); // 20000 + 5000 (forward-fill)
  });

  it("handles contributions outside range", () => {
    const goals = [makeGoal()];
    const contributions = [
      makeContribution({
        id: "c1",
        created_at: "2024-06-01T00:00:00Z",
        balance_after_cents: 5000,
      }),
      makeContribution({
        id: "c2",
        created_at: "2025-02-01T00:00:00Z",
        balance_after_cents: 30000,
      }),
    ];

    const result = aggregateGoalHistory(
      goals,
      contributions,
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );

    // The pre-start contribution should be used as initial value
    const startPoint = result.find((p) => p.date === "2025-01-01");
    expect(startPoint).toBeDefined();
    expect(startPoint!.valueCents).toBe(5000); // forward-fill from pre-start
  });
});

// ============================================================================
// aggregateSingleGoalHistory
// ============================================================================

describe("aggregateSingleGoalHistory", () => {
  it("delegates to aggregateGoalHistory for a single goal", () => {
    const goal = makeGoal();
    const contributions = [
      makeContribution({
        created_at: "2025-02-01T00:00:00Z",
        balance_after_cents: 25000,
      }),
    ];

    const result = aggregateSingleGoalHistory(
      goal,
      contributions,
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );

    expect(result.length).toBeGreaterThan(0);
    const feb1 = result.find((p) => p.date === "2025-02-01");
    expect(feb1).toBeDefined();
    expect(feb1!.valueCents).toBe(25000);
  });
});

// ============================================================================
// calculateSavingsRate
// ============================================================================

describe("calculateSavingsRate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero for empty contributions", () => {
    const rate = calculateSavingsRate([], 90);
    expect(rate.dailyRate).toBe(0);
    expect(rate.monthlyRate).toBe(0);
    expect(rate.weeklyRate).toBe(0);
  });

  it("returns zero for zero period", () => {
    const rate = calculateSavingsRate([makeContribution()], 0);
    expect(rate.dailyRate).toBe(0);
  });

  it("calculates rate from recent contributions", () => {
    // $100 added 30 days ago, $200 added 15 days ago
    const contributions = [
      makeContribution({
        id: "c1",
        amount_cents: 10000,
        created_at: "2025-03-02T00:00:00Z",
        source: "manual",
      }),
      makeContribution({
        id: "c2",
        amount_cents: 20000,
        created_at: "2025-03-17T00:00:00Z",
        source: "manual",
      }),
    ];

    const rate = calculateSavingsRate(contributions, 90);
    // Total: 30000 over 90 days = ~333/day
    expect(rate.dailyRate).toBe(333);
    expect(rate.monthlyRate).toBeGreaterThan(0);
  });

  it("excludes initial contributions from rate calculation", () => {
    const contributions = [
      makeContribution({
        id: "c1",
        amount_cents: 50000,
        created_at: "2025-03-01T00:00:00Z",
        source: "initial", // should be excluded
      }),
      makeContribution({
        id: "c2",
        amount_cents: 10000,
        created_at: "2025-03-15T00:00:00Z",
        source: "manual",
      }),
    ];

    const rate = calculateSavingsRate(contributions, 90);
    // Only 10000 over 90 days = ~111/day
    expect(rate.dailyRate).toBe(111);
  });

  it("only counts positive contributions", () => {
    const contributions = [
      makeContribution({
        id: "c1",
        amount_cents: 20000,
        created_at: "2025-03-01T00:00:00Z",
        source: "manual",
      }),
      makeContribution({
        id: "c2",
        amount_cents: -5000,
        created_at: "2025-03-15T00:00:00Z",
        source: "webhook_sync",
      }),
    ];

    const rate = calculateSavingsRate(contributions, 90);
    // Only 20000 counted (negative excluded via Math.max)
    expect(rate.dailyRate).toBe(222);
  });
});

// ============================================================================
// calculateProjectedCompletion
// ============================================================================

describe("calculateProjectedCompletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current date when goal is already complete", () => {
    const goal = makeGoal({
      current_amount_cents: 100000,
      target_amount_cents: 100000,
    });
    const result = calculateProjectedCompletion(goal, []);
    expect(result).toBeDefined();
    expect(result!.getTime()).toBeCloseTo(new Date("2025-04-01").getTime(), -3);
  });

  it("returns null when no savings activity", () => {
    const goal = makeGoal({ current_amount_cents: 0 });
    const result = calculateProjectedCompletion(goal, []);
    expect(result).toBeNull();
  });

  it("projects based on actual savings rate", () => {
    const goal = makeGoal({
      current_amount_cents: 50000,
      target_amount_cents: 100000,
    });
    // Adding $100/day over last 90 days
    const contributions = Array.from({ length: 90 }, (_, i) =>
      makeContribution({
        id: `c${i}`,
        amount_cents: 556, // ~$500/90 days = ~$5.56/day
        created_at: new Date(2025, 0, 2 + i).toISOString(),
        source: "manual",
      })
    );

    const result = calculateProjectedCompletion(goal, contributions);
    expect(result).toBeDefined();
    expect(result!.getTime()).toBeGreaterThan(new Date("2025-04-01").getTime());
  });

  it("uses budget allocation when it's higher than actual rate", () => {
    const goal = makeGoal({
      current_amount_cents: 50000,
      target_amount_cents: 100000,
    });
    // Very low actual rate
    const contributions = [
      makeContribution({
        amount_cents: 100,
        created_at: "2025-03-01T00:00:00Z",
        source: "manual",
      }),
    ];

    // High budget allocation: $1000/month
    const resultWithBudget = calculateProjectedCompletion(goal, contributions, 100000);
    const resultWithoutBudget = calculateProjectedCompletion(goal, contributions);

    // With budget should project sooner
    if (resultWithBudget && resultWithoutBudget) {
      expect(resultWithBudget.getTime()).toBeLessThan(resultWithoutBudget.getTime());
    } else {
      // At minimum, budget version should return a date
      expect(resultWithBudget).toBeDefined();
    }
  });
});

// ============================================================================
// classifyGoalStatus
// ============================================================================

describe("classifyGoalStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns completed for completed goals", () => {
    const goal = makeGoal({ is_completed: true });
    const result = classifyGoalStatus(goal, []);
    expect(result.status).toBe("completed");
  });

  it("returns no-deadline for goals without deadline", () => {
    const goal = makeGoal({ deadline: null });
    const result = classifyGoalStatus(goal, []);
    expect(result.status).toBe("no-deadline");
  });

  it("returns overdue when deadline has passed", () => {
    const goal = makeGoal({
      deadline: "2025-03-01",
      current_amount_cents: 50000,
      target_amount_cents: 100000,
    });
    const result = classifyGoalStatus(goal, []);
    expect(result.status).toBe("overdue");
    expect(result.daysAheadOrBehind).toBeLessThan(0);
  });

  it("returns behind when savings rate is insufficient", () => {
    const goal = makeGoal({
      deadline: "2025-12-31", // 9 months away
      current_amount_cents: 10000, // $100 saved
      target_amount_cents: 1000000, // $10,000 target
    });
    // Tiny contributions — way behind
    const contributions = [
      makeContribution({
        amount_cents: 100,
        created_at: "2025-03-15T00:00:00Z",
        source: "manual",
      }),
    ];
    const result = classifyGoalStatus(goal, contributions);
    expect(result.status).toBe("behind");
  });

  it("returns ahead or on-track when savings rate is sufficient", () => {
    const goal = makeGoal({
      deadline: "2025-06-01", // 2 months away
      current_amount_cents: 90000, // $900 saved
      target_amount_cents: 100000, // $1000 target — only $100 to go
    });
    // High savings rate
    const contributions = Array.from({ length: 60 }, (_, i) =>
      makeContribution({
        id: `c${i}`,
        amount_cents: 1500, // ~$15/day = $450/month
        created_at: new Date(2025, 1, 1 + i).toISOString(),
        source: "manual",
      })
    );
    const result = classifyGoalStatus(goal, contributions);
    expect(["on-track", "ahead"]).toContain(result.status);
  });

  it("calculates monthly savings needed correctly", () => {
    const goal = makeGoal({
      deadline: "2025-07-01", // 3 months away
      current_amount_cents: 40000,
      target_amount_cents: 100000,
    });
    const result = classifyGoalStatus(goal, []);
    // $600 remaining / ~3 months = ~$200/month
    expect(result.monthlySavingsNeeded).toBeGreaterThan(0);
    expect(result.monthlySavingsNeeded).toBeLessThan(100000); // sanity check
  });
});

// ============================================================================
// getStartDateForPeriod
// ============================================================================

describe("getStartDateForPeriod", () => {
  const now = new Date("2025-04-01T00:00:00Z");

  it("returns 1 month ago for 1M", () => {
    const result = getStartDateForPeriod("1M", now);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getFullYear()).toBe(2025);
  });

  it("returns 3 months ago for 3M", () => {
    const result = getStartDateForPeriod("3M", now);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getFullYear()).toBe(2025);
  });

  it("returns 6 months ago for 6M", () => {
    const result = getStartDateForPeriod("6M", now);
    expect(result.getMonth()).toBe(9); // October
    expect(result.getFullYear()).toBe(2024);
  });

  it("returns 1 year ago for 1Y", () => {
    const result = getStartDateForPeriod("1Y", now);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(3); // April
  });

  it("returns year 2000 for ALL", () => {
    const result = getStartDateForPeriod("ALL", now);
    expect(result.getFullYear()).toBe(2000);
  });

  it("defaults to 3M for unknown period", () => {
    const result = getStartDateForPeriod("UNKNOWN", now);
    expect(result.getMonth()).toBe(0); // January (3 months before April)
  });
});

// ============================================================================
// calculateSuggestedSavings
// ============================================================================

describe("calculateSuggestedSavings", () => {
  const now = new Date("2025-04-01T00:00:00Z");

  it("returns zeroes when no deadline", () => {
    const result = calculateSuggestedSavings(50000, null, now);
    expect(result.weekly).toBe(0);
    expect(result.fortnightly).toBe(0);
    expect(result.monthly).toBe(0);
    expect(result.hasDeadline).toBe(false);
    expect(result.daysRemaining).toBeNull();
  });

  it("returns zeroes when remaining is zero", () => {
    const result = calculateSuggestedSavings(0, "2025-07-01", now);
    expect(result.weekly).toBe(0);
    expect(result.fortnightly).toBe(0);
    expect(result.monthly).toBe(0);
  });

  it("returns zeroes when remaining is negative (over target)", () => {
    const result = calculateSuggestedSavings(-1000, "2025-07-01", now);
    expect(result.weekly).toBe(0);
    expect(result.fortnightly).toBe(0);
    expect(result.monthly).toBe(0);
  });

  it("calculates correct W/F/M for a goal with deadline", () => {
    // $500 remaining, 91 days to deadline (roughly 13 weeks, ~6.5 fortnights, ~3 months)
    const remaining = 50000; // $500 in cents
    const deadline = "2025-07-01"; // 91 days from April 1
    const result = calculateSuggestedSavings(remaining, deadline, now);

    expect(result.hasDeadline).toBe(true);
    expect(result.daysRemaining).toBe(91);

    // Weekly: $500 / (91/7) = $500 / 13 = ~$38.46/week → ceil = 3847
    expect(result.weekly).toBeGreaterThan(3800);
    expect(result.weekly).toBeLessThan(3900);

    // Fortnightly: $500 / (91/14) = $500 / 6.5 = ~$76.92/fortnight → ceil
    expect(result.fortnightly).toBeGreaterThan(7600);
    expect(result.fortnightly).toBeLessThan(7800);

    // Monthly: $500 / (91/30.44) = $500 / 2.99 = ~$167/month → ceil
    expect(result.monthly).toBeGreaterThan(16600);
    expect(result.monthly).toBeLessThan(16800);
  });

  it("handles overdue goal (deadline passed)", () => {
    // Deadline was yesterday
    const result = calculateSuggestedSavings(50000, "2025-03-31", now);

    expect(result.hasDeadline).toBe(true);
    expect(result.daysRemaining).toBe(0);

    // Overdue: spread over 1 month (4 weeks, 2 fortnights)
    expect(result.weekly).toBe(Math.ceil(50000 / 4));
    expect(result.fortnightly).toBe(Math.ceil(50000 / 2));
    expect(result.monthly).toBe(50000);
  });

  it("handles very short deadline (1 day)", () => {
    // Only 1 day left
    const result = calculateSuggestedSavings(10000, "2025-04-02", now);

    expect(result.daysRemaining).toBe(1);
    // All frequencies should ask for the full remaining amount (since < 1 week/fortnight/month)
    expect(result.weekly).toBe(10000); // 1 day / 7 = 0.14 weeks → max(0.14, 1) = 1 week
    expect(result.fortnightly).toBe(10000); // 1 day / 14 → max = 1 fortnight
    expect(result.monthly).toBe(10000); // 1 day / 30.44 → max = 1 month
  });

  it("scales proportionally — larger remaining needs larger savings", () => {
    const small = calculateSuggestedSavings(10000, "2025-07-01", now);
    const large = calculateSuggestedSavings(100000, "2025-07-01", now);

    expect(large.weekly).toBeGreaterThan(small.weekly);
    expect(large.fortnightly).toBeGreaterThan(small.fortnightly);
    expect(large.monthly).toBeGreaterThan(small.monthly);
  });

  it("weekly < fortnightly < monthly", () => {
    const result = calculateSuggestedSavings(50000, "2025-07-01", now);
    expect(result.weekly).toBeLessThan(result.fortnightly);
    expect(result.fortnightly).toBeLessThan(result.monthly);
  });
});
