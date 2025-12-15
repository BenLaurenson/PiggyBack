import { describe, it, expect } from "vitest";
import {
  aggregatePortfolioHistory,
  calculatePerformanceMetrics,
  calculateTopMovers,
  calculateRebalancing,
  getStartDateForPeriod,
} from "../portfolio-aggregation";

describe("aggregatePortfolioHistory", () => {
  it("returns empty array for no investments", () => {
    const result = aggregatePortfolioHistory(
      [],
      [],
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );
    expect(result).toEqual([]);
  });

  it("aggregates single investment history", () => {
    const investments = [
      { id: "inv1", current_value_cents: 50000, purchase_value_cents: 40000, created_at: "2025-01-01T00:00:00Z" },
    ];
    const history = [
      { investment_id: "inv1", value_cents: 40000, recorded_at: "2025-01-15T00:00:00Z" },
      { investment_id: "inv1", value_cents: 45000, recorded_at: "2025-02-15T00:00:00Z" },
      { investment_id: "inv1", value_cents: 50000, recorded_at: "2025-03-15T00:00:00Z" },
    ];

    const result = aggregatePortfolioHistory(
      investments,
      history,
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].date).toBe("2025-01-01");
    // First date should have forward-filled value from current_value_cents (no pre-start history)
    const jan15 = result.find((p) => p.date === "2025-01-15");
    expect(jan15).toBeDefined();
    expect(jan15!.valueCents).toBe(40000);

    const mar15 = result.find((p) => p.date === "2025-03-15");
    expect(mar15).toBeDefined();
    expect(mar15!.valueCents).toBe(50000);
  });

  it("aggregates multiple investments with forward-fill", () => {
    const investments = [
      { id: "inv1", current_value_cents: 30000, purchase_value_cents: 20000, created_at: "2025-01-01T00:00:00Z" },
      { id: "inv2", current_value_cents: 50000, purchase_value_cents: 40000, created_at: "2025-01-01T00:00:00Z" },
    ];
    const history = [
      { investment_id: "inv1", value_cents: 20000, recorded_at: "2025-01-10T00:00:00Z" },
      { investment_id: "inv2", value_cents: 40000, recorded_at: "2025-01-10T00:00:00Z" },
      { investment_id: "inv1", value_cents: 25000, recorded_at: "2025-02-10T00:00:00Z" },
      // inv2 has no update on Feb 10 — should forward-fill 40000
      { investment_id: "inv2", value_cents: 50000, recorded_at: "2025-03-10T00:00:00Z" },
    ];

    const result = aggregatePortfolioHistory(
      investments,
      history,
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );

    // On Jan 10: inv1=20000, inv2=40000 => 60000
    const jan10 = result.find((p) => p.date === "2025-01-10");
    expect(jan10).toBeDefined();
    expect(jan10!.valueCents).toBe(60000);

    // On Feb 10: inv1=25000, inv2=40000 (forward-filled) => 65000
    const feb10 = result.find((p) => p.date === "2025-02-10");
    expect(feb10).toBeDefined();
    expect(feb10!.valueCents).toBe(65000);

    // On Mar 10: inv1=25000 (forward-filled), inv2=50000 => 75000
    const mar10 = result.find((p) => p.date === "2025-03-10");
    expect(mar10).toBeDefined();
    expect(mar10!.valueCents).toBe(75000);
  });

  it("handles investment created after start date", () => {
    const investments = [
      { id: "inv1", current_value_cents: 30000, purchase_value_cents: 20000, created_at: "2025-01-01T00:00:00Z" },
      { id: "inv2", current_value_cents: 10000, purchase_value_cents: 10000, created_at: "2025-02-15T00:00:00Z" },
    ];
    const history = [
      { investment_id: "inv1", value_cents: 20000, recorded_at: "2025-01-10T00:00:00Z" },
      { investment_id: "inv2", value_cents: 10000, recorded_at: "2025-02-15T00:00:00Z" },
      { investment_id: "inv1", value_cents: 30000, recorded_at: "2025-03-10T00:00:00Z" },
    ];

    const result = aggregatePortfolioHistory(
      investments,
      history,
      new Date("2025-01-01"),
      new Date("2025-03-31")
    );

    // On Jan 10: only inv1 existed => 20000
    const jan10 = result.find((p) => p.date === "2025-01-10");
    expect(jan10!.valueCents).toBe(20000);

    // On Feb 15: inv1=20000 (forward-filled), inv2=10000 => 30000
    const feb15 = result.find((p) => p.date === "2025-02-15");
    expect(feb15!.valueCents).toBe(30000);
  });

  it("uses pre-start history for forward-fill", () => {
    const investments = [
      { id: "inv1", current_value_cents: 50000, purchase_value_cents: 40000, created_at: "2024-06-01T00:00:00Z" },
    ];
    const history = [
      { investment_id: "inv1", value_cents: 42000, recorded_at: "2024-12-20T00:00:00Z" },
      { investment_id: "inv1", value_cents: 45000, recorded_at: "2025-01-15T00:00:00Z" },
    ];

    const result = aggregatePortfolioHistory(
      investments,
      history,
      new Date("2025-01-01"),
      new Date("2025-01-31")
    );

    // Start date should use pre-start value of 42000
    const jan1 = result.find((p) => p.date === "2025-01-01");
    expect(jan1!.valueCents).toBe(42000);

    const jan15 = result.find((p) => p.date === "2025-01-15");
    expect(jan15!.valueCents).toBe(45000);
  });
});

describe("calculatePerformanceMetrics", () => {
  it("calculates ROI and identifies best/worst performers", () => {
    const investments = [
      { id: "1", name: "AAPL", current_value_cents: 15000, purchase_value_cents: 10000, created_at: "" },
      { id: "2", name: "GOOG", current_value_cents: 8000, purchase_value_cents: 10000, created_at: "" },
      { id: "3", name: "MSFT", current_value_cents: 12000, purchase_value_cents: 10000, created_at: "" },
    ];

    const metrics = calculatePerformanceMetrics(investments);

    expect(metrics.totalGainCents).toBe(5000); // 35000 - 30000
    expect(metrics.totalROIPercent).toBeCloseTo(16.67, 1);
    expect(metrics.bestPerformer).toEqual({ name: "AAPL", gainPercent: 50 });
    expect(metrics.worstPerformer).toEqual({ name: "GOOG", gainPercent: -20 });
  });

  it("handles investments without purchase value", () => {
    const investments = [
      { id: "1", name: "BTC", current_value_cents: 50000, purchase_value_cents: null, created_at: "" },
    ];

    const metrics = calculatePerformanceMetrics(investments);

    expect(metrics.totalGainCents).toBe(50000);
    expect(metrics.totalROIPercent).toBe(0);
    expect(metrics.bestPerformer).toBeNull();
    expect(metrics.worstPerformer).toBeNull();
  });

  it("handles empty portfolio", () => {
    const metrics = calculatePerformanceMetrics([]);
    expect(metrics.totalGainCents).toBe(0);
    expect(metrics.totalROIPercent).toBe(0);
    expect(metrics.bestPerformer).toBeNull();
    expect(metrics.worstPerformer).toBeNull();
  });
});

describe("calculateTopMovers", () => {
  it("returns top gainers and losers sorted by percentage", () => {
    const investments = [
      { id: "1", name: "AAPL", ticker_symbol: "AAPL", asset_type: "stock", current_value_cents: 20000, purchase_value_cents: 10000, created_at: "" },
      { id: "2", name: "GOOG", ticker_symbol: "GOOG", asset_type: "stock", current_value_cents: 7000, purchase_value_cents: 10000, created_at: "" },
      { id: "3", name: "MSFT", ticker_symbol: "MSFT", asset_type: "stock", current_value_cents: 13000, purchase_value_cents: 10000, created_at: "" },
      { id: "4", name: "TSLA", ticker_symbol: "TSLA", asset_type: "stock", current_value_cents: 5000, purchase_value_cents: 10000, created_at: "" },
    ];

    const { gainers, losers } = calculateTopMovers(investments);

    expect(gainers).toHaveLength(2);
    expect(gainers[0].name).toBe("AAPL"); // +100%
    expect(gainers[1].name).toBe("MSFT"); // +30%

    expect(losers).toHaveLength(2);
    expect(losers[0].name).toBe("TSLA"); // -50%
    expect(losers[1].name).toBe("GOOG"); // -30%
  });

  it("limits to 3 gainers and 3 losers", () => {
    const investments = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`,
      name: `Stock${i}`,
      ticker_symbol: `S${i}`,
      asset_type: "stock" as const,
      current_value_cents: 10000 + i * 2000,
      purchase_value_cents: 10000,
      created_at: "",
    }));

    const { gainers } = calculateTopMovers(investments);
    expect(gainers.length).toBeLessThanOrEqual(3);
  });
});

describe("calculateRebalancing", () => {
  it("calculates deltas between current and target allocation", () => {
    const current = [
      { assetType: "stock", valueCents: 60000 },
      { assetType: "etf", valueCents: 30000 },
      { assetType: "crypto", valueCents: 10000 },
    ];
    const targets = [
      { asset_type: "stock", target_percentage: 50 },
      { asset_type: "etf", target_percentage: 40 },
      { asset_type: "crypto", target_percentage: 10 },
    ];

    const deltas = calculateRebalancing(current, targets, 100000);

    const stockDelta = deltas.find((d) => d.assetType === "stock");
    expect(stockDelta!.currentPercent).toBe(60);
    expect(stockDelta!.targetPercent).toBe(50);
    expect(stockDelta!.isOverweight).toBe(true);
    expect(stockDelta!.deltaCents).toBe(10000);

    const etfDelta = deltas.find((d) => d.assetType === "etf");
    expect(etfDelta!.currentPercent).toBe(30);
    expect(etfDelta!.targetPercent).toBe(40);
    expect(etfDelta!.isOverweight).toBe(false);
    expect(etfDelta!.deltaCents).toBe(-10000);
  });

  it("returns empty for no targets", () => {
    const current = [{ assetType: "stock", valueCents: 100000 }];
    expect(calculateRebalancing(current, [], 100000)).toEqual([]);
  });

  it("returns empty for zero total value", () => {
    const targets = [{ asset_type: "stock", target_percentage: 100 }];
    expect(calculateRebalancing([], targets, 0)).toEqual([]);
  });

  it("handles asset types in target but not in portfolio", () => {
    const current = [{ assetType: "stock", valueCents: 100000 }];
    const targets = [
      { asset_type: "stock", target_percentage: 60 },
      { asset_type: "etf", target_percentage: 40 },
    ];

    const deltas = calculateRebalancing(current, targets, 100000);

    const etfDelta = deltas.find((d) => d.assetType === "etf");
    expect(etfDelta!.currentPercent).toBe(0);
    expect(etfDelta!.targetPercent).toBe(40);
    expect(etfDelta!.isOverweight).toBe(false);
  });
});

describe("getStartDateForPeriod", () => {
  const now = new Date("2025-06-15T00:00:00Z");

  it("returns 7 days ago for 1W", () => {
    const d = getStartDateForPeriod("1W", now);
    expect(d.toISOString().split("T")[0]).toBe("2025-06-08");
  });

  it("returns 1 month ago for 1M", () => {
    const d = getStartDateForPeriod("1M", now);
    expect(d.toISOString().split("T")[0]).toBe("2025-05-15");
  });

  it("returns 3 months ago for 3M", () => {
    const d = getStartDateForPeriod("3M", now);
    expect(d.toISOString().split("T")[0]).toBe("2025-03-15");
  });

  it("returns 6 months ago for 6M", () => {
    const d = getStartDateForPeriod("6M", now);
    expect(d.toISOString().split("T")[0]).toBe("2024-12-15");
  });

  it("returns 1 year ago for 1Y", () => {
    const d = getStartDateForPeriod("1Y", now);
    expect(d.toISOString().split("T")[0]).toBe("2024-06-15");
  });

  it("returns year 2000 for ALL", () => {
    const d = getStartDateForPeriod("ALL", now);
    expect(d.getFullYear()).toBe(2000);
  });

  it("defaults to 3M for unknown period", () => {
    const d = getStartDateForPeriod("xyz", now);
    expect(d.toISOString().split("T")[0]).toBe("2025-03-15");
  });
});
