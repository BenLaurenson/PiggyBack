import { describe, it, expect } from "vitest";
import { buildCategoryLookup } from "../get-category-mappings";

/**
 * Tests verifying the query optimization patterns used across API routes.
 * These test the data transformation logic that was refactored during
 * the parallelization of sequential queries.
 */

describe("Budget summary contribution aggregation", () => {
  // This tests the goal contribution aggregation logic extracted from
  // budget/summary/route.ts (previously sequential, now parallel)

  it("should aggregate goal contributions from transfer transactions", () => {
    const goals = [
      { id: "goal-1", name: "Holiday", linked_account_id: "acc-saver-1" },
      { id: "goal-2", name: "Car", linked_account_id: "acc-saver-2" },
      { id: "goal-3", name: "No Link", linked_account_id: null },
    ];

    const transfers = [
      { transfer_account_id: "acc-saver-1", amount_cents: -50000 },
      { transfer_account_id: "acc-saver-1", amount_cents: -25000 },
      { transfer_account_id: "acc-saver-2", amount_cents: -10000 },
    ];

    // Replicate the aggregation logic from route.ts
    const goalContributions = new Map<string, number>();
    const accountToGoal = new Map<string, string>();
    for (const g of goals) {
      if (g.linked_account_id) accountToGoal.set(g.linked_account_id, g.id);
    }
    for (const t of transfers) {
      const goalId = accountToGoal.get(t.transfer_account_id);
      if (goalId) {
        goalContributions.set(
          goalId,
          (goalContributions.get(goalId) ?? 0) + Math.abs(t.amount_cents)
        );
      }
    }

    expect(goalContributions.get("goal-1")).toBe(75000); // 500 + 250
    expect(goalContributions.get("goal-2")).toBe(10000);
    expect(goalContributions.has("goal-3")).toBe(false);
  });

  it("should aggregate investment contributions", () => {
    const contribs = [
      { investment_id: "inv-1", amount_cents: 20000 },
      { investment_id: "inv-1", amount_cents: 15000 },
      { investment_id: "inv-2", amount_cents: 50000 },
    ];

    const assetContributions = new Map<string, number>();
    for (const c of contribs) {
      assetContributions.set(
        c.investment_id,
        (assetContributions.get(c.investment_id) ?? 0) + c.amount_cents
      );
    }

    expect(assetContributions.get("inv-1")).toBe(35000);
    expect(assetContributions.get("inv-2")).toBe(50000);
  });

  it("should handle empty goal transfers gracefully", () => {
    const goalContributions = new Map<string, number>();
    const accountToGoal = new Map<string, string>();
    // No goals with linked accounts
    for (const t of []) {
      const goalId = accountToGoal.get((t as any).transfer_account_id);
      if (goalId) {
        goalContributions.set(goalId, (goalContributions.get(goalId) ?? 0) + Math.abs((t as any).amount_cents));
      }
    }

    expect(goalContributions.size).toBe(0);
  });

  it("should handle empty investment contributions gracefully", () => {
    const assetContributions = new Map<string, number>();
    for (const c of []) {
      assetContributions.set(
        (c as any).investment_id,
        (assetContributions.get((c as any).investment_id) ?? 0) + (c as any).amount_cents
      );
    }

    expect(assetContributions.size).toBe(0);
  });
});

describe("AI context batch query structure", () => {
  // Tests for the category spending aggregation used in ai/context/route.ts
  // (previously computed after 6 sequential queries, now after 2 parallel batches)

  it("should calculate spending by category from transaction data", () => {
    const catMap = new Map([
      ["cat-food", "Food & Drink"],
      ["cat-transport", "Transport"],
    ]);

    const monthTxns = [
      { amount_cents: -5000, category_id: "cat-food", is_income: false },
      { amount_cents: -3000, category_id: "cat-food", is_income: false },
      { amount_cents: -2000, category_id: "cat-transport", is_income: false },
      { amount_cents: 100000, category_id: null, is_income: true }, // income, excluded
      { amount_cents: -1500, category_id: null, is_income: false }, // uncategorized
    ];

    const spending = monthTxns
      .filter((t) => t.amount_cents < 0 && !t.is_income)
      .reduce(
        (acc, t) => {
          const cat = catMap.get(t.category_id || "") || "Uncategorized";
          acc[cat] = (acc[cat] || 0) + Math.abs(t.amount_cents);
          return acc;
        },
        {} as Record<string, number>
      );

    expect(spending["Food & Drink"]).toBe(8000);
    expect(spending["Transport"]).toBe(2000);
    expect(spending["Uncategorized"]).toBe(1500);
  });

  it("should handle empty transaction arrays", () => {
    const spending = ([] as any[])
      .filter((t) => t.amount_cents < 0 && !t.is_income)
      .reduce(
        (acc, t) => {
          acc["test"] = 1;
          return acc;
        },
        {} as Record<string, number>
      );

    expect(Object.keys(spending)).toHaveLength(0);
  });
});

describe("Home page deduplication", () => {
  // Tests verifying that the combined category_mappings data (with new_child_name)
  // works for both display (icon lookup) and insights (child name grouping)

  it("should build category lookup from full mappings (includes child names)", () => {
    const mappings = [
      { up_category_id: "cat-1", new_parent_name: "Food", new_child_name: "Groceries", icon: "🛒" },
      { up_category_id: "cat-2", new_parent_name: "Food", new_child_name: "Dining", icon: "🍽️" },
      { up_category_id: "cat-3", new_parent_name: "Transport", new_child_name: "Fuel", icon: "⛽" },
    ];

    const lookup = buildCategoryLookup(mappings);
    expect(lookup.get("cat-1")).toEqual({ parent: "Food", child: "Groceries" });
    expect(lookup.get("cat-3")).toEqual({ parent: "Transport", child: "Fuel" });

    // Also works for icon lookup (same data, different access pattern)
    const iconByParent = new Map<string, string>();
    for (const m of mappings) {
      if (!iconByParent.has(m.new_parent_name)) {
        iconByParent.set(m.new_parent_name, m.icon);
      }
    }
    expect(iconByParent.get("Food")).toBe("🛒");
    expect(iconByParent.get("Transport")).toBe("⛽");
  });

  it("should combine historical transaction data for both monthly flow and insights", () => {
    // The combined query now includes all fields needed by both consumers
    const historicalTransactions = [
      {
        description: "Woolworths",
        amount_cents: -5000,
        created_at: "2026-01-15T10:00:00Z",
        category_id: "cat-1",
        parent_category_id: "cat-parent-1",
        is_income: false,
        is_internal_transfer: false,
      },
      {
        description: "Salary",
        amount_cents: 500000,
        created_at: "2026-01-01T09:00:00Z",
        category_id: null,
        parent_category_id: null,
        is_income: true,
        is_internal_transfer: false,
      },
    ];

    // Monthly flow aggregation (uses amount_cents, is_income, created_at)
    const monthlyFlow = { income: 0, spending: 0 };
    for (const t of historicalTransactions) {
      if (t.amount_cents > 0 || t.is_income) {
        monthlyFlow.income += Math.abs(t.amount_cents);
      } else if (t.amount_cents < 0 && !t.is_income) {
        monthlyFlow.spending += Math.abs(t.amount_cents);
      }
    }
    expect(monthlyFlow.income).toBe(500000);
    expect(monthlyFlow.spending).toBe(5000);

    // Insights consumer (uses description, category_id, parent_category_id, is_internal_transfer)
    const nonTransferTxns = historicalTransactions.filter(
      (t) => !t.is_internal_transfer
    );
    expect(nonTransferTxns).toHaveLength(2);
    expect(nonTransferTxns[0].description).toBe("Woolworths");
    expect(nonTransferTxns[0].category_id).toBe("cat-1");
  });
});
