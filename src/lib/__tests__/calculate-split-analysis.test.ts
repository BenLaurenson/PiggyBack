import { describe, it, expect } from "vitest";
import { calculateSplitAnalysis } from "../calculate-split-analysis";
import type {
  CategoryMapping,
  IncomeSourceInput,
  SplitSettingInput,
  TransactionInput,
} from "../budget-engine";

const mappings: CategoryMapping[] = [
  { up_category_id: "groceries", new_parent_name: "Food & Dining", new_child_name: "Groceries" },
  { up_category_id: "rent", new_parent_name: "Housing", new_child_name: "Rent" },
];

describe("calculateSplitAnalysis", () => {
  it("returns hasEnoughData=false when there is no shared spend", () => {
    const result = calculateSplitAnalysis({
      transactions: [],
      categoryMappings: mappings,
      splitSettings: [],
      incomeSources: [
        { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-1" },
      ],
      userId: "user-1",
      ownerUserId: "user-1",
    });
    expect(result.hasEnoughData).toBe(false);
    expect(result.totalSharedSpend).toBe(0);
    expect(result.userPaid).toBe(0);
    expect(result.partnerPaid).toBe(0);
  });

  it("computes 50/50 spend with equal income → balanced", () => {
    const txns: TransactionInput[] = [
      { id: "g1", amount_cents: -10000, category_id: "groceries", created_at: "2026-04-10" },
    ];
    const incomeSources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-1" },
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-2" },
    ];
    const result = calculateSplitAnalysis({
      transactions: txns,
      categoryMappings: mappings,
      splitSettings: [],
      incomeSources,
      userId: "user-1",
      ownerUserId: "user-1",
    });
    expect(result.userPaidPercentage).toBe(50);
    expect(result.userIncomePercentage).toBe(50);
    expect(result.rebalanceTarget).toBe("balanced");
    expect(result.suggestedRebalanceCents).toBe(0);
  });

  it("flags rebalance to partner when user pays more than income share", () => {
    // User pays 70% of $1000, has 60% of income.
    const splits: SplitSettingInput[] = [
      { category_name: "Housing", split_type: "custom", owner_percentage: 70 },
    ];
    const txns: TransactionInput[] = [
      { id: "r1", amount_cents: -100000, category_id: "rent", created_at: "2026-04-01" },
    ];
    const incomeSources: IncomeSourceInput[] = [
      { amount_cents: 600000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-1" },
      { amount_cents: 400000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-2" },
    ];
    const result = calculateSplitAnalysis({
      transactions: txns,
      categoryMappings: mappings,
      splitSettings: splits,
      incomeSources,
      userId: "user-1",
      ownerUserId: "user-1",
    });
    expect(result.userPaidPercentage).toBe(70);
    expect(result.userIncomePercentage).toBe(60);
    expect(result.rebalanceTarget).toBe("partner");
    // Gap = 10% of $1000 = $100 = 10000 cents.
    expect(result.suggestedRebalanceCents).toBe(10000);
  });

  it("counts manual partner income as the partner's side", () => {
    const incomeSources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-1" },
      {
        amount_cents: 700000,
        frequency: "monthly",
        source_type: "recurring-salary",
        user_id: "user-1", // would normally count as user-1, but…
        is_manual_partner_income: true,
      },
    ];
    const result = calculateSplitAnalysis({
      transactions: [
        { id: "g1", amount_cents: -10000, category_id: "groceries", created_at: "2026-04-10" },
      ],
      categoryMappings: mappings,
      splitSettings: [],
      incomeSources,
      userId: "user-1",
      ownerUserId: "user-1",
    });
    // 500k user / 1.2M total = 41.6...% → 42 rounded
    expect(result.userMonthlyIncome).toBe(500000);
    expect(result.partnerMonthlyIncome).toBe(700000);
    expect(result.userIncomePercentage).toBe(42);
  });

  it("normalises non-monthly frequencies to monthly", () => {
    const incomeSources: IncomeSourceInput[] = [
      { amount_cents: 200000, frequency: "fortnightly", source_type: "recurring-salary", user_id: "user-1" },
      { amount_cents: 100000, frequency: "weekly", source_type: "recurring-salary", user_id: "user-2" },
    ];
    const result = calculateSplitAnalysis({
      transactions: [
        { id: "g1", amount_cents: -1000, category_id: "groceries", created_at: "2026-04-10" },
      ],
      categoryMappings: mappings,
      splitSettings: [],
      incomeSources,
      userId: "user-1",
      ownerUserId: "user-1",
    });
    // user: 200000 * (26/12) = 433333.33… → 433333
    // partner: 100000 * (52/12) = 433333.33… → 433333
    expect(result.userMonthlyIncome).toBe(Math.round(200000 * 26 / 12));
    expect(result.partnerMonthlyIncome).toBe(Math.round(100000 * 52 / 12));
    expect(result.userIncomePercentage).toBe(50);
  });
});
