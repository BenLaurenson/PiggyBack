import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateNetWorthTrend,
  calculateSavingsRateMetric,
  calculateEmergencyFundMetric,
  calculateGoalsProgressMetric,
  calculateSpendingRatioMetric,
  calculateBillsPaymentMetric,
  calculateDebtToIncomeMetric,
  generateHealthMetrics,
  calculateSuperCapRoom,
  generatePriorityRecommendations,
  analyzeGoalInteractions,
  type NetWorthSnapshot,
  type GoalSummary,
  type HealthMetricInputs,
  type RecommendationInputs,
  type GoalForTimeline,
} from "../plan-health-calculations";

// ============================================================================
// calculateNetWorthTrend
// ============================================================================

describe("calculateNetWorthTrend", () => {
  it("returns concern status with no snapshots", () => {
    const result = calculateNetWorthTrend([]);
    expect(result.id).toBe("net-worth");
    expect(result.status).toBe("concern");
    expect(result.trend).toBe("flat");
    expect(result.value).toBe("$0");
  });

  it("detects upward trend", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-01-01", total_balance_cents: 100_000_00 },
      { snapshot_date: "2026-02-01", total_balance_cents: 120_000_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    expect(result.status).toBe("good");
    expect(result.trend).toBe("up");
    expect(result.value).toBe("$120,000");
  });

  it("detects downward trend", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-01-01", total_balance_cents: 120_000_00 },
      { snapshot_date: "2026-02-01", total_balance_cents: 100_000_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    expect(result.status).toBe("concern");
    expect(result.trend).toBe("down");
  });

  it("detects flat trend within 1% threshold", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-01-01", total_balance_cents: 100_000_00 },
      { snapshot_date: "2026-02-01", total_balance_cents: 100_500_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    expect(result.status).toBe("warning");
    expect(result.trend).toBe("flat");
  });

  it("uses latest snapshot for value", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-02-15", total_balance_cents: 200_000_00 },
      { snapshot_date: "2026-01-01", total_balance_cents: 100_000_00 },
      { snapshot_date: "2026-02-01", total_balance_cents: 150_000_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    expect(result.value).toBe("$200,000");
    expect(result.rawValue).toBe(200_000_00);
  });

  it("handles single snapshot", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-01-01", total_balance_cents: 50_000_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    expect(result.value).toBe("$50,000");
    expect(result.trend).toBe("flat");
  });

  it("includes investment_total_cents in net worth value", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-01-01", total_balance_cents: 50_000_00, investment_total_cents: 50_000_00 },
      { snapshot_date: "2026-02-01", total_balance_cents: 50_000_00, investment_total_cents: 70_000_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    expect(result.value).toBe("$120,000"); // 50k bank + 70k investments
    expect(result.rawValue).toBe(120_000_00);
    expect(result.trend).toBe("up"); // went from 100k to 120k
  });

  it("handles null investment_total_cents gracefully", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-01-01", total_balance_cents: 100_000_00, investment_total_cents: null },
      { snapshot_date: "2026-02-01", total_balance_cents: 120_000_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    expect(result.value).toBe("$120,000");
    expect(result.trend).toBe("up");
  });

  it("calculates trend correctly with investments", () => {
    const snapshots: NetWorthSnapshot[] = [
      { snapshot_date: "2026-01-01", total_balance_cents: 50_000_00, investment_total_cents: 100_000_00 },
      { snapshot_date: "2026-02-01", total_balance_cents: 45_000_00, investment_total_cents: 80_000_00 },
    ];
    const result = calculateNetWorthTrend(snapshots);
    // Went from 150k to 125k — that's a decrease
    expect(result.value).toBe("$125,000");
    expect(result.trend).toBe("down");
  });
});

// ============================================================================
// calculateSavingsRateMetric
// ============================================================================

describe("calculateSavingsRateMetric", () => {
  it("returns good status for >= 20% rate", () => {
    const result = calculateSavingsRateMetric(500_000, 350_000, []);
    expect(result.status).toBe("good");
    expect(result.rawValue).toBe(30); // (500k - 350k) / 500k * 100
  });

  it("returns warning for 10-20% rate", () => {
    const result = calculateSavingsRateMetric(500_000, 425_000, []);
    expect(result.status).toBe("warning");
    expect(result.rawValue).toBe(15);
  });

  it("returns concern for < 10% rate", () => {
    const result = calculateSavingsRateMetric(500_000, 475_000, []);
    expect(result.status).toBe("concern");
    expect(result.rawValue).toBe(5);
  });

  it("clamps negative savings rate to 0", () => {
    const result = calculateSavingsRateMetric(500_000, 600_000, []);
    expect(result.rawValue).toBe(0);
    expect(result.status).toBe("concern");
  });

  it("handles zero income", () => {
    const result = calculateSavingsRateMetric(0, 500_000, []);
    expect(result.rawValue).toBe(0);
    expect(result.status).toBe("concern");
  });

  it("detects upward trend vs previous rates", () => {
    const result = calculateSavingsRateMetric(500_000, 350_000, [10, 12, 15]);
    // current = 30%, previous avg = 12.3% → up
    expect(result.trend).toBe("up");
  });

  it("detects downward trend vs previous rates", () => {
    const result = calculateSavingsRateMetric(500_000, 475_000, [20, 25, 22]);
    // current = 5%, previous avg = 22.3% → down
    expect(result.trend).toBe("down");
  });

  it("detects flat trend with no previous rates", () => {
    const result = calculateSavingsRateMetric(500_000, 350_000, []);
    expect(result.trend).toBe("flat");
  });
});

// ============================================================================
// calculateEmergencyFundMetric
// ============================================================================

describe("calculateEmergencyFundMetric", () => {
  it("returns good for >= 6 months coverage", () => {
    const result = calculateEmergencyFundMetric(600_000, 100_000);
    expect(result.status).toBe("good");
    expect(result.rawValue).toBe(6);
  });

  it("returns warning for 3-6 months coverage", () => {
    const result = calculateEmergencyFundMetric(400_000, 100_000);
    expect(result.status).toBe("warning");
    expect(result.rawValue).toBe(4);
  });

  it("returns concern for < 3 months coverage", () => {
    const result = calculateEmergencyFundMetric(100_000, 100_000);
    expect(result.status).toBe("concern");
    expect(result.rawValue).toBe(1);
  });

  it("handles zero essentials", () => {
    const result = calculateEmergencyFundMetric(500_000, 0);
    expect(result.status).toBe("warning");
    expect(result.statusLabel).toContain("Not enough spending data");
  });

  it("handles zero balance", () => {
    const result = calculateEmergencyFundMetric(0, 100_000);
    expect(result.status).toBe("concern");
    expect(result.rawValue).toBe(0);
  });
});

// ============================================================================
// calculateGoalsProgressMetric
// ============================================================================

describe("calculateGoalsProgressMetric", () => {
  it("returns good for >= 70% progress", () => {
    const goals: GoalSummary[] = [
      { current_amount_cents: 8000_00, target_amount_cents: 10000_00, is_completed: false },
    ];
    const result = calculateGoalsProgressMetric(goals);
    expect(result.status).toBe("good");
    expect(result.rawValue).toBe(80);
  });

  it("returns warning for 40-70% progress", () => {
    const goals: GoalSummary[] = [
      { current_amount_cents: 5000_00, target_amount_cents: 10000_00, is_completed: false },
    ];
    const result = calculateGoalsProgressMetric(goals);
    expect(result.status).toBe("warning");
    expect(result.rawValue).toBe(50);
  });

  it("returns concern for < 40% progress", () => {
    const goals: GoalSummary[] = [
      { current_amount_cents: 1000_00, target_amount_cents: 10000_00, is_completed: false },
    ];
    const result = calculateGoalsProgressMetric(goals);
    expect(result.status).toBe("concern");
    expect(result.rawValue).toBe(10);
  });

  it("excludes completed goals", () => {
    const goals: GoalSummary[] = [
      { current_amount_cents: 10000_00, target_amount_cents: 10000_00, is_completed: true },
      { current_amount_cents: 2000_00, target_amount_cents: 10000_00, is_completed: false },
    ];
    const result = calculateGoalsProgressMetric(goals);
    expect(result.rawValue).toBe(20); // Only counts the active goal
  });

  it("returns warning with no active goals", () => {
    const result = calculateGoalsProgressMetric([]);
    expect(result.status).toBe("warning");
    expect(result.value).toBe("No goals");
  });

  it("aggregates multiple goals", () => {
    const goals: GoalSummary[] = [
      { current_amount_cents: 7000_00, target_amount_cents: 10000_00, is_completed: false },
      { current_amount_cents: 3000_00, target_amount_cents: 10000_00, is_completed: false },
    ];
    const result = calculateGoalsProgressMetric(goals);
    expect(result.rawValue).toBe(50); // 10k / 20k
  });
});

// ============================================================================
// calculateSpendingRatioMetric
// ============================================================================

describe("calculateSpendingRatioMetric", () => {
  it("returns good for < 50% essentials", () => {
    const result = calculateSpendingRatioMetric(400_00, 600_00);
    expect(result.status).toBe("good");
    expect(result.rawValue).toBe(40);
  });

  it("returns warning for 50-65% essentials", () => {
    const result = calculateSpendingRatioMetric(600_00, 400_00);
    expect(result.status).toBe("warning");
    expect(result.rawValue).toBe(60);
  });

  it("returns concern for > 65% essentials", () => {
    const result = calculateSpendingRatioMetric(800_00, 200_00);
    expect(result.status).toBe("concern");
    expect(result.rawValue).toBe(80);
  });

  it("handles zero spending", () => {
    const result = calculateSpendingRatioMetric(0, 0);
    expect(result.status).toBe("warning");
    expect(result.value).toBe("N/A");
  });
});

// ============================================================================
// calculateBillsPaymentMetric
// ============================================================================

describe("calculateBillsPaymentMetric", () => {
  it("returns good for >= 90% paid", () => {
    const result = calculateBillsPaymentMetric(10, 9);
    expect(result.status).toBe("good");
    expect(result.value).toBe("9/10");
  });

  it("returns good for 100% paid", () => {
    const result = calculateBillsPaymentMetric(5, 5);
    expect(result.status).toBe("good");
    expect(result.statusLabel).toContain("All bills paid");
  });

  it("returns warning for 70-90% paid", () => {
    const result = calculateBillsPaymentMetric(10, 8);
    expect(result.status).toBe("warning");
  });

  it("returns concern for < 70% paid", () => {
    const result = calculateBillsPaymentMetric(10, 5);
    expect(result.status).toBe("concern");
  });

  it("returns good with no tracked bills", () => {
    const result = calculateBillsPaymentMetric(0, 0);
    expect(result.status).toBe("good");
    expect(result.value).toBe("N/A");
  });
});

// ============================================================================
// calculateDebtToIncomeMetric
// ============================================================================

describe("calculateDebtToIncomeMetric", () => {
  it("returns null if no debt", () => {
    const result = calculateDebtToIncomeMetric(0, 100_000_00);
    expect(result).toBeNull();
  });

  it("returns good for ratio < 3x", () => {
    const result = calculateDebtToIncomeMetric(200_000_00, 100_000_00);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("good");
    expect(result!.rawValue).toBe(2);
  });

  it("returns warning for ratio 3-5x", () => {
    const result = calculateDebtToIncomeMetric(400_000_00, 100_000_00);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("warning");
    expect(result!.rawValue).toBe(4);
  });

  it("returns concern for ratio > 5x", () => {
    const result = calculateDebtToIncomeMetric(700_000_00, 100_000_00);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("concern");
    expect(result!.rawValue).toBe(7);
  });

  it("handles zero income with debt", () => {
    const result = calculateDebtToIncomeMetric(500_000_00, 0);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("warning");
  });
});

// ============================================================================
// generateHealthMetrics (orchestrator)
// ============================================================================

describe("generateHealthMetrics", () => {
  const baseInputs: HealthMetricInputs = {
    netWorthSnapshots: [
      { snapshot_date: "2026-01-01", total_balance_cents: 100_000_00 },
      { snapshot_date: "2026-02-01", total_balance_cents: 110_000_00 },
    ],
    monthlyIncomeCents: 800_000,
    monthlySpendingCents: 600_000,
    previousSavingsRates: [],
    liquidBalanceCents: 2_000_000,
    monthlyEssentialsCents: 300_000,
    goals: [
      { current_amount_cents: 7000_00, target_amount_cents: 10000_00, is_completed: false },
    ],
    essentialCents: 400_00,
    discretionaryCents: 600_00,
    totalExpenseDefinitions: 5,
    matchedExpenseCount: 5,
    homeLoanBalanceCents: 0,
    annualIncomeCents: 96_000_00,
  };

  it("generates 6 metrics when no debt", () => {
    const metrics = generateHealthMetrics(baseInputs);
    expect(metrics).toHaveLength(6);
    expect(metrics.map((m) => m.id)).toEqual([
      "net-worth",
      "savings-rate",
      "emergency-fund",
      "goals-progress",
      "spending-ratio",
      "bills-payment",
    ]);
  });

  it("generates 7 metrics when debt exists", () => {
    const metrics = generateHealthMetrics({
      ...baseInputs,
      homeLoanBalanceCents: 400_000_00,
    });
    expect(metrics).toHaveLength(7);
    expect(metrics[6].id).toBe("debt-to-income");
  });

  it("all metrics have required fields", () => {
    const metrics = generateHealthMetrics(baseInputs);
    for (const m of metrics) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.value).toBeTruthy();
      expect(["good", "warning", "concern"]).toContain(m.status);
      expect(["up", "down", "flat"]).toContain(m.trend);
      expect(m.statusLabel).toBeTruthy();
      expect(m.icon).toBeTruthy();
    }
  });
});

// ============================================================================
// calculateSuperCapRoom
// ============================================================================

describe("calculateSuperCapRoom", () => {
  it("calculates correct cap room", () => {
    // $100k salary, 11.5% SG = $11,500 used, $18,500 remaining
    const result = calculateSuperCapRoom(100_000_00, 11.5);
    expect(result.capCents).toBe(30_000_00);
    expect(result.usedCents).toBe(11_500_00);
    expect(result.remainingCents).toBe(18_500_00);
  });

  it("includes voluntary contributions", () => {
    const result = calculateSuperCapRoom(100_000_00, 11.5, 5_000_00);
    expect(result.usedCents).toBe(16_500_00);
    expect(result.remainingCents).toBe(13_500_00);
  });

  it("clamps remaining to 0 when over cap", () => {
    // $300k salary, 11.5% SG = $34,500 → cap is $30k, so 0 remaining
    const result = calculateSuperCapRoom(300_000_00, 11.5);
    expect(result.remainingCents).toBe(0);
  });

  it("handles zero salary", () => {
    const result = calculateSuperCapRoom(0, 11.5);
    expect(result.usedCents).toBe(0);
    expect(result.remainingCents).toBe(30_000_00);
  });
});

// ============================================================================
// generatePriorityRecommendations
// ============================================================================

describe("generatePriorityRecommendations", () => {
  const baseInputs: RecommendationInputs = {
    healthMetrics: [],
    emergencyFundMonths: 6,
    savingsRatePercent: 25,
    essentialRatioPercent: 45,
    superCapRoomCents: 5_000_00,
    rebalancingNeeded: false,
    goalsBehindCount: 0,
    unpaidBillsCount: 0,
    upcomingGoals: [],
    liquidBalanceCents: 1_000_000,
  };

  it("returns empty when everything is healthy", () => {
    const recs = generatePriorityRecommendations(baseInputs);
    expect(recs).toHaveLength(0);
  });

  it("generates emergency fund recommendation", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      emergencyFundMonths: 1.5,
    });
    expect(recs.some((r) => r.id === "emergency-fund-low")).toBe(true);
    expect(recs[0].priority).toBe("high");
  });

  it("generates low savings rate recommendation", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      savingsRatePercent: 5,
    });
    expect(recs.some((r) => r.id === "low-savings-rate")).toBe(true);
  });

  it("generates unpaid bills recommendation", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      unpaidBillsCount: 3,
    });
    expect(recs.some((r) => r.id === "unpaid-bills")).toBe(true);
    expect(recs.find((r) => r.id === "unpaid-bills")!.priority).toBe("high");
  });

  it("generates super cap room recommendation when > $10k", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      superCapRoomCents: 15_000_00,
    });
    expect(recs.some((r) => r.id === "super-cap-room")).toBe(true);
    expect(recs.find((r) => r.id === "super-cap-room")!.priority).toBe("medium");
  });

  it("does NOT generate super cap room recommendation when <= $10k", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      superCapRoomCents: 5_000_00,
    });
    expect(recs.some((r) => r.id === "super-cap-room")).toBe(false);
  });

  it("generates high essentials recommendation", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      essentialRatioPercent: 70,
    });
    expect(recs.some((r) => r.id === "high-essentials")).toBe(true);
  });

  it("generates goals behind recommendation", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      goalsBehindCount: 2,
    });
    expect(recs.some((r) => r.id === "goals-behind")).toBe(true);
  });

  it("generates rebalancing recommendation", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      rebalancingNeeded: true,
    });
    expect(recs.some((r) => r.id === "rebalancing")).toBe(true);
    expect(recs.find((r) => r.id === "rebalancing")!.priority).toBe("low");
  });

  it("sorts by priority (high first)", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      emergencyFundMonths: 1,
      rebalancingNeeded: true,
      superCapRoomCents: 15_000_00,
    });
    expect(recs[0].priority).toBe("high");
    // Low priority items come after
    const priorities = recs.map((r) => r.priority);
    const highIdx = priorities.indexOf("high");
    const lowIdx = priorities.indexOf("low");
    if (highIdx >= 0 && lowIdx >= 0) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
  });

  it("limits to max 5 recommendations", () => {
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      emergencyFundMonths: 1,
      savingsRatePercent: 5,
      unpaidBillsCount: 3,
      superCapRoomCents: 15_000_00,
      essentialRatioPercent: 70,
      goalsBehindCount: 2,
      rebalancingNeeded: true,
    });
    expect(recs.length).toBeLessThanOrEqual(5);
  });

  it("generates goal deadline warning for approaching underfunded goal", () => {
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    const goal: GoalForTimeline = {
      id: "g1",
      name: "Buy a Car",
      deadline: threeMonthsFromNow.toISOString(),
      target_amount_cents: 2_000_000, // $20,000
      is_completed: false,
    };
    const recs = generatePriorityRecommendations({
      ...baseInputs,
      upcomingGoals: [goal],
      liquidBalanceCents: 500_000, // $5,000 - short of $20,000
    });
    expect(recs.some((r) => r.id === "goal-deadline-g1")).toBe(true);
  });
});

// ============================================================================
// analyzeGoalInteractions
// ============================================================================

describe("analyzeGoalInteractions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty for no goals", () => {
    const result = analyzeGoalInteractions([], 1_000_000, 300_000, 200_000);
    expect(result).toHaveLength(0);
  });

  it("returns empty when essentials is zero", () => {
    const goals: GoalForTimeline[] = [
      {
        id: "g1",
        name: "Buy a house",
        deadline: "2026-08-01",
        target_amount_cents: 5_000_000,
        is_completed: false,
      },
    ];
    const result = analyzeGoalInteractions(goals, 1_000_000, 0, 200_000);
    expect(result).toHaveLength(0);
  });

  it("warns when goal would reduce emergency fund below 3 months", () => {
    const goals: GoalForTimeline[] = [
      {
        id: "g1",
        name: "Buy a car",
        deadline: "2026-06-01",
        target_amount_cents: 1_500_000, // $15,000
        is_completed: false,
      },
    ];
    // liquid = $10k, monthly essentials = $3k, monthly savings = $2k
    // ~3.5 months until June, accumulated = $7k, balance before = $17k, after = $2k
    // Emergency months after = $2k / $3k = 0.67 months → warning
    const result = analyzeGoalInteractions(
      goals,
      1_000_000, // $10,000 liquid
      300_000,   // $3,000/mo essentials
      200_000    // $2,000/mo savings
    );
    expect(result).toHaveLength(1);
    expect(result[0].goalId).toBe("g1");
    expect(result[0].emergencyFundMonthsAfter).toBeLessThan(3);
  });

  it("skips completed goals", () => {
    const goals: GoalForTimeline[] = [
      {
        id: "g1",
        name: "Already done",
        deadline: "2026-06-01",
        target_amount_cents: 5_000_000,
        is_completed: true,
      },
    ];
    const result = analyzeGoalInteractions(goals, 500_000, 300_000, 200_000);
    expect(result).toHaveLength(0);
  });

  it("skips goals with zero target", () => {
    const goals: GoalForTimeline[] = [
      {
        id: "g1",
        name: "Career change",
        deadline: "2026-06-01",
        target_amount_cents: 0,
        is_completed: false,
      },
    ];
    const result = analyzeGoalInteractions(goals, 500_000, 300_000, 200_000);
    expect(result).toHaveLength(0);
  });

  it("no warning when goal is well-funded", () => {
    const goals: GoalForTimeline[] = [
      {
        id: "g1",
        name: "Vacation",
        deadline: "2026-12-01",
        target_amount_cents: 200_000, // $2,000
        is_completed: false,
      },
    ];
    // liquid = $50k, essentials = $3k, savings = $5k/mo
    // Tons of savings by December, well above 3mo emergency fund
    const result = analyzeGoalInteractions(
      goals,
      5_000_000,
      300_000,
      500_000
    );
    expect(result).toHaveLength(0);
  });

  it("cascades impact across sequential goals", () => {
    const goals: GoalForTimeline[] = [
      {
        id: "g1",
        name: "First goal",
        deadline: "2026-06-01",
        target_amount_cents: 800_000, // $8,000
        is_completed: false,
      },
      {
        id: "g2",
        name: "Second goal",
        deadline: "2026-09-01",
        target_amount_cents: 800_000, // $8,000
        is_completed: false,
      },
    ];
    // liquid = $10k, essentials = $3k, savings = $2k/mo
    const result = analyzeGoalInteractions(
      goals,
      1_000_000,
      300_000,
      200_000
    );
    // First goal might be OK-ish, second one is more likely to trigger
    // At least one should warn
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
