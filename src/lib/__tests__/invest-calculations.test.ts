import { describe, it, expect } from "vitest";
import {
  calculatePortfolioTotals,
  groupByAssetType,
  calculateAllocation,
  calculateFireProgress,
  mapBudgetContributions,
  aggregateDividendsByMonth,
  calculateAnnualizedReturn,
  calculatePortfolioWeight,
  InvestmentRecord,
} from "../invest-calculations";

// ─── Test Data Helpers ──────────────────────────────────────

function makeInvestment(overrides: Partial<InvestmentRecord> = {}): InvestmentRecord {
  return {
    id: "inv-1",
    asset_type: "stock",
    name: "Test Stock",
    ticker_symbol: "TST",
    current_value_cents: 10000,
    purchase_value_cents: 8000,
    quantity: 10,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── calculatePortfolioTotals ───────────────────────────────

describe("calculatePortfolioTotals", () => {
  it("calculates totals for a single investment", () => {
    const investments = [makeInvestment({ current_value_cents: 15000, purchase_value_cents: 10000 })];
    const result = calculatePortfolioTotals(investments);

    expect(result.totalValue).toBe(15000);
    expect(result.totalPurchaseValue).toBe(10000);
    expect(result.totalGain).toBe(5000);
    expect(result.totalGainPercentage).toBe(50);
  });

  it("sums multiple investments", () => {
    const investments = [
      makeInvestment({ id: "1", current_value_cents: 20000, purchase_value_cents: 15000 }),
      makeInvestment({ id: "2", current_value_cents: 30000, purchase_value_cents: 25000 }),
      makeInvestment({ id: "3", current_value_cents: 50000, purchase_value_cents: 60000 }),
    ];
    const result = calculatePortfolioTotals(investments);

    expect(result.totalValue).toBe(100000);
    expect(result.totalPurchaseValue).toBe(100000);
    expect(result.totalGain).toBe(0);
    expect(result.totalGainPercentage).toBe(0);
  });

  it("handles investments with null purchase value", () => {
    const investments = [
      makeInvestment({ current_value_cents: 10000, purchase_value_cents: null }),
    ];
    const result = calculatePortfolioTotals(investments);

    expect(result.totalValue).toBe(10000);
    expect(result.totalPurchaseValue).toBe(0);
    expect(result.totalGain).toBe(10000);
    expect(result.totalGainPercentage).toBe(0); // No purchase value to calculate %
  });

  it("handles empty portfolio", () => {
    const result = calculatePortfolioTotals([]);

    expect(result.totalValue).toBe(0);
    expect(result.totalPurchaseValue).toBe(0);
    expect(result.totalGain).toBe(0);
    expect(result.totalGainPercentage).toBe(0);
  });

  it("calculates negative gain correctly", () => {
    const investments = [
      makeInvestment({ current_value_cents: 8000, purchase_value_cents: 10000 }),
    ];
    const result = calculatePortfolioTotals(investments);

    expect(result.totalGain).toBe(-2000);
    expect(result.totalGainPercentage).toBe(-20);
  });
});

// ─── groupByAssetType ───────────────────────────────────────

describe("groupByAssetType", () => {
  it("groups investments by asset type", () => {
    const investments = [
      makeInvestment({ id: "1", asset_type: "stock" }),
      makeInvestment({ id: "2", asset_type: "crypto" }),
      makeInvestment({ id: "3", asset_type: "stock" }),
      makeInvestment({ id: "4", asset_type: "etf" }),
    ];

    const groups = groupByAssetType(investments);

    expect(Object.keys(groups)).toHaveLength(3);
    expect(groups["stock"]).toHaveLength(2);
    expect(groups["crypto"]).toHaveLength(1);
    expect(groups["etf"]).toHaveLength(1);
  });

  it("returns empty object for empty portfolio", () => {
    const groups = groupByAssetType([]);
    expect(Object.keys(groups)).toHaveLength(0);
  });

  it("handles single asset type", () => {
    const investments = [
      makeInvestment({ id: "1", asset_type: "crypto" }),
      makeInvestment({ id: "2", asset_type: "crypto" }),
    ];

    const groups = groupByAssetType(investments);
    expect(Object.keys(groups)).toHaveLength(1);
    expect(groups["crypto"]).toHaveLength(2);
  });
});

// ─── calculateAllocation ────────────────────────────────────

describe("calculateAllocation", () => {
  it("calculates allocation by asset type", () => {
    const investments = [
      makeInvestment({ id: "1", asset_type: "stock", current_value_cents: 60000 }),
      makeInvestment({ id: "2", asset_type: "stock", current_value_cents: 40000 }),
      makeInvestment({ id: "3", asset_type: "crypto", current_value_cents: 30000 }),
      makeInvestment({ id: "4", asset_type: "etf", current_value_cents: 70000 }),
    ];

    const allocation = calculateAllocation(investments);

    const stock = allocation.find((a) => a.type === "stock");
    expect(stock!.value).toBe(100000);
    expect(stock!.count).toBe(2);

    const crypto = allocation.find((a) => a.type === "crypto");
    expect(crypto!.value).toBe(30000);
    expect(crypto!.count).toBe(1);

    const etf = allocation.find((a) => a.type === "etf");
    expect(etf!.value).toBe(70000);
    expect(etf!.count).toBe(1);
  });

  it("returns empty array for empty portfolio", () => {
    expect(calculateAllocation([])).toEqual([]);
  });
});

// ─── calculateFireProgress ──────────────────────────────────

describe("calculateFireProgress", () => {
  const mockFireNumber = (annual: number) => annual * 25;

  it("calculates progress with override expenses", () => {
    const result = calculateFireProgress(
      5000000, // $50k investments
      3000000, // $30k super
      4000000, // $40k annual expenses override
      "regular",
      mockFireNumber
    );

    expect(result).not.toBeNull();
    expect(result!.currentTotalCents).toBe(8000000); // $80k
    expect(result!.fireNumberCents).toBe(100000000); // $40k * 25 = $1M
    expect(result!.progressPercent).toBe(8);
  });

  it("uses $60k default when no override", () => {
    const result = calculateFireProgress(
      50000000, // $500k investments
      25000000, // $250k super
      null, // No override
      "regular",
      mockFireNumber
    );

    expect(result!.fireNumberCents).toBe(150000000); // $60k * 25 = $1.5M
    expect(result!.currentTotalCents).toBe(75000000); // $750k
    expect(result!.progressPercent).toBe(50);
  });

  it("caps progress at 100%", () => {
    const result = calculateFireProgress(
      200000000, // $2M investments
      100000000, // $1M super
      6000000, // $60k annual expenses
      "fat",
      mockFireNumber
    );

    expect(result!.progressPercent).toBe(100);
  });

  it("handles zero FIRE number edge case", () => {
    const result = calculateFireProgress(
      10000,
      0,
      null,
      "regular",
      () => 0 // edge case: zero fire number
    );

    expect(result!.progressPercent).toBe(0);
  });

  it("preserves fire variant", () => {
    const result = calculateFireProgress(0, 0, null, "lean", mockFireNumber);
    expect(result!.fireVariant).toBe("lean");
  });

  it("defaults variant to regular when empty", () => {
    const result = calculateFireProgress(0, 0, null, "", mockFireNumber);
    expect(result!.fireVariant).toBe("regular");
  });
});

// ─── mapBudgetContributions ─────────────────────────────────

describe("mapBudgetContributions", () => {
  const investments = [
    makeInvestment({ id: "inv-1", name: "VAS ETF" }),
    makeInvestment({ id: "inv-2", name: "Bitcoin" }),
  ];

  it("maps assignments to investment names", () => {
    const assignments = [
      { asset_id: "inv-1", assigned_cents: 50000 },
      { asset_id: "inv-2", assigned_cents: 30000 },
    ];

    const { contributions, total } = mapBudgetContributions(assignments, investments);

    expect(contributions).toHaveLength(2);
    expect(contributions[0].investmentName).toBe("VAS ETF");
    expect(contributions[0].assignedCents).toBe(50000);
    expect(total).toBe(80000);
  });

  it("filters out zero-value assignments", () => {
    const assignments = [
      { asset_id: "inv-1", assigned_cents: 50000 },
      { asset_id: "inv-2", assigned_cents: 0 },
    ];

    const { contributions, total } = mapBudgetContributions(assignments, investments);
    expect(contributions).toHaveLength(1);
    expect(total).toBe(50000);
  });

  it("uses Unknown for unmatched investment IDs", () => {
    const assignments = [{ asset_id: "inv-unknown", assigned_cents: 10000 }];

    const { contributions } = mapBudgetContributions(assignments, investments);
    expect(contributions[0].investmentName).toBe("Unknown");
  });

  it("handles empty assignments", () => {
    const { contributions, total } = mapBudgetContributions([], investments);
    expect(contributions).toHaveLength(0);
    expect(total).toBe(0);
  });
});

// ─── aggregateDividendsByMonth ──────────────────────────────

describe("aggregateDividendsByMonth", () => {
  it("aggregates transactions into monthly buckets", () => {
    const now = new Date("2025-06-15T00:00:00Z");
    const transactions = [
      { amount_cents: 5000, created_at: "2025-06-10T00:00:00Z" },
      { amount_cents: 3000, created_at: "2025-06-05T00:00:00Z" },
      { amount_cents: 2000, created_at: "2025-05-15T00:00:00Z" },
      { amount_cents: -4000, created_at: "2025-04-20T00:00:00Z" }, // Negative uses abs
    ];

    const { monthly, annualTotal, monthlyAvg } = aggregateDividendsByMonth(transactions, now);

    expect(monthly).toHaveLength(12);

    // Last 3 months should have data (index 9=Apr, 10=May, 11=Jun)
    // Most recent month is last in array
    const lastMonth = monthly[monthly.length - 1]; // June
    expect(lastMonth.amountCents).toBe(8000); // 5000 + 3000

    const secondLast = monthly[monthly.length - 2]; // May
    expect(secondLast.amountCents).toBe(2000);

    const thirdLast = monthly[monthly.length - 3]; // April
    expect(thirdLast.amountCents).toBe(4000); // abs(-4000)

    expect(annualTotal).toBe(14000);
    expect(monthlyAvg).toBe(Math.round(14000 / 12));
  });

  it("returns 12 months even with no transactions", () => {
    const now = new Date("2025-06-15T00:00:00Z");
    const { monthly, annualTotal, monthlyAvg } = aggregateDividendsByMonth([], now);

    expect(monthly).toHaveLength(12);
    expect(annualTotal).toBe(0);
    expect(monthlyAvg).toBe(0);
    expect(monthly.every((m) => m.amountCents === 0)).toBe(true);
  });

  it("correctly handles year boundary", () => {
    const now = new Date("2025-02-15T00:00:00Z");
    const transactions = [
      { amount_cents: 1000, created_at: "2024-05-10T00:00:00Z" },
      { amount_cents: 2000, created_at: "2025-01-15T00:00:00Z" },
    ];

    const { monthly } = aggregateDividendsByMonth(transactions, now);

    // 12 months from Mar 2024 to Feb 2025
    expect(monthly).toHaveLength(12);
    // Jan 2025 is second-to-last (index 10), Feb 2025 is last (index 11)
    const jan = monthly[monthly.length - 2];
    expect(jan.amountCents).toBe(2000);

    // May 2024 should have the 1000 transaction (index 2, since Mar is 0)
    const may = monthly[2]; // Mar=0, Apr=1, May=2
    expect(may.amountCents).toBe(1000);
  });
});

// ─── calculateAnnualizedReturn ──────────────────────────────

describe("calculateAnnualizedReturn", () => {
  it("calculates simple return for < 1 year", () => {
    const now = new Date("2025-06-15T00:00:00Z");
    const result = calculateAnnualizedReturn(
      12000, // current
      10000, // purchase
      "2025-01-15T00:00:00Z", // ~5 months ago
      now
    );

    // Simple return: (12000 - 10000) / 10000 * 100 = 20%
    expect(result).toBeCloseTo(20, 0);
  });

  it("calculates annualized return for > 1 year", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const result = calculateAnnualizedReturn(
      15000, // current
      10000, // purchase
      "2024-06-15T00:00:00Z", // exactly 2 years ago
      now
    );

    // 50% total return over 2 years, annualized ~22.5%
    expect(result).toBeGreaterThan(20);
    expect(result).toBeLessThan(25);
  });

  it("returns 0 for null purchase value", () => {
    const result = calculateAnnualizedReturn(10000, null, "2025-01-01T00:00:00Z");
    expect(result).toBe(0);
  });

  it("returns 0 for zero purchase value", () => {
    const result = calculateAnnualizedReturn(10000, 0, "2025-01-01T00:00:00Z");
    expect(result).toBe(0);
  });

  it("handles negative returns", () => {
    const now = new Date("2025-06-15T00:00:00Z");
    const result = calculateAnnualizedReturn(
      8000, // current (lost money)
      10000, // purchase
      "2025-01-15T00:00:00Z",
      now
    );

    expect(result).toBeLessThan(0);
    expect(result).toBeCloseTo(-20, 0);
  });

  it("handles null created_at (uses 1 day)", () => {
    const result = calculateAnnualizedReturn(11000, 10000, null);
    // 10% simple return (< 365 days)
    expect(result).toBeCloseTo(10, 0);
  });

  it("handles same-day purchase (1 day min)", () => {
    const now = new Date("2025-06-15T00:00:00Z");
    const result = calculateAnnualizedReturn(
      10500,
      10000,
      "2025-06-15T00:00:00Z",
      now
    );
    // 5% simple return
    expect(result).toBeCloseTo(5, 0);
  });
});

// ─── calculatePortfolioWeight ───────────────────────────────

describe("calculatePortfolioWeight", () => {
  it("calculates percentage weight", () => {
    expect(calculatePortfolioWeight(25000, 100000)).toBe(25);
  });

  it("returns 0 for zero total portfolio", () => {
    expect(calculatePortfolioWeight(10000, 0)).toBe(0);
  });

  it("returns 100 for single investment", () => {
    expect(calculatePortfolioWeight(50000, 50000)).toBe(100);
  });

  it("handles very small weights", () => {
    const weight = calculatePortfolioWeight(100, 1000000);
    expect(weight).toBeCloseTo(0.01, 2);
  });
});
