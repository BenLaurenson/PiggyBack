import { describe, it, expect } from "vitest";
import {
  getBudgetPeriodRange,
  convertToTargetPeriod,
  resolveSplitPercentage,
  calculateIncome,
  calculateBudgeted,
  calculateSpent,
  calculateCarryover,
  calculateBudgetSummary,
  getNextPeriodDate,
  getPreviousPeriodDate,
  getMonthKeyForPeriod,
  DEFAULT_BUDGET_TIMEZONE,
  getDateComponentsInTimezone,
  midnightInTimezone,
  type PeriodRange,
  type IncomeSourceInput,
  type AssignmentInput,
  type ExpenseDefInput,
  type SplitSettingInput,
  type TransactionInput,
  type CategoryMapping,
  type BudgetSummaryInput,
} from "../budget-engine";

describe("getBudgetPeriodRange", () => {
  // Pass "UTC" to get UTC-based boundaries (backward-compatible behavior)
  describe("monthly (UTC)", () => {
    it("returns first to last day of month", () => {
      const result = getBudgetPeriodRange(new Date("2026-02-15"), "monthly", "UTC");
      expect(result.start).toEqual(
        new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0))
      );
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999))
      );
    });

    it("handles leap year February", () => {
      const result = getBudgetPeriodRange(new Date("2028-02-15"), "monthly", "UTC");
      expect(result.end).toEqual(
        new Date(Date.UTC(2028, 1, 29, 23, 59, 59, 999))
      );
    });

    it("handles 31-day months", () => {
      const result = getBudgetPeriodRange(new Date("2026-01-20"), "monthly", "UTC");
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999))
      );
    });
  });

  describe("weekly (month-aligned: 1-7, 8-14, 15-21, 22-end) (UTC)", () => {
    it("week 1: day 1-7", () => {
      const result = getBudgetPeriodRange(new Date("2026-02-03"), "weekly", "UTC");
      expect(result.start).toEqual(
        new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0))
      );
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 1, 7, 23, 59, 59, 999))
      );
    });

    it("week 2: day 8-14", () => {
      const result = getBudgetPeriodRange(new Date("2026-02-10"), "weekly", "UTC");
      expect(result.start).toEqual(
        new Date(Date.UTC(2026, 1, 8, 0, 0, 0, 0))
      );
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 1, 14, 23, 59, 59, 999))
      );
    });

    it("week 3: day 15-21", () => {
      const result = getBudgetPeriodRange(new Date("2026-02-18"), "weekly", "UTC");
      expect(result.start).toEqual(
        new Date(Date.UTC(2026, 1, 15, 0, 0, 0, 0))
      );
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 1, 21, 23, 59, 59, 999))
      );
    });

    it("week 4: day 22 to end of month", () => {
      const result = getBudgetPeriodRange(new Date("2026-02-25"), "weekly", "UTC");
      expect(result.start).toEqual(
        new Date(Date.UTC(2026, 1, 22, 0, 0, 0, 0))
      );
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999))
      );
    });

    it("week 4 of 31-day month extends to 31st", () => {
      const result = getBudgetPeriodRange(new Date("2026-01-30"), "weekly", "UTC");
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999))
      );
    });
  });

  describe("fortnightly (month-aligned: 1-14, 15-end) (UTC)", () => {
    it("first half: day 1-14", () => {
      const result = getBudgetPeriodRange(
        new Date("2026-02-08"),
        "fortnightly",
        "UTC"
      );
      expect(result.start).toEqual(
        new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0))
      );
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 1, 14, 23, 59, 59, 999))
      );
    });

    it("second half: day 15 to end of month", () => {
      const result = getBudgetPeriodRange(
        new Date("2026-02-20"),
        "fortnightly",
        "UTC"
      );
      expect(result.start).toEqual(
        new Date(Date.UTC(2026, 1, 15, 0, 0, 0, 0))
      );
      expect(result.end).toEqual(
        new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999))
      );
    });
  });

  describe("label generation", () => {
    it("monthly: 'February 2026'", () => {
      const result = getBudgetPeriodRange(new Date("2026-02-15"), "monthly");
      expect(result.label).toMatch(/February.*2026/);
    });

    it("weekly: 'Week of 1 Feb'", () => {
      const result = getBudgetPeriodRange(new Date("2026-02-03"), "weekly");
      expect(result.label).toMatch(/Week/i);
    });

    it("fortnightly: '1 Feb - 14 Feb'", () => {
      const result = getBudgetPeriodRange(
        new Date("2026-02-08"),
        "fortnightly"
      );
      expect(result.label).toMatch(/Feb/);
    });
  });

  describe("timezone-aware boundaries (Australia/Sydney)", () => {
    const tz = "Australia/Sydney";

    it("monthly: start is midnight AEDT, not midnight UTC", () => {
      // Feb 15 at noon UTC = Feb 15 at 11pm AEDT (still Feb)
      const result = getBudgetPeriodRange(new Date("2026-02-15T12:00:00Z"), "monthly", tz);
      // Feb 1 midnight AEDT = Jan 31 13:00 UTC (AEDT = UTC+11 in Feb)
      expect(result.start).toEqual(midnightInTimezone(2026, 1, 1, tz));
      // End = just before Mar 1 midnight AEDT
      expect(result.end.getTime()).toBe(midnightInTimezone(2026, 2, 1, tz).getTime() - 1);
    });

    it("correctly determines month from timezone date, not UTC date", () => {
      // Feb 28 at 2pm UTC = March 1 at 1am AEDT — should be in MARCH
      const result = getBudgetPeriodRange(new Date("2026-02-28T14:00:00Z"), "monthly", tz);
      expect(result.label).toMatch(/March.*2026/);
    });

    it("Feb 28 at noon UTC is still Feb in AEDT", () => {
      // Feb 28 at noon UTC = Feb 28 at 11pm AEDT — still February
      const result = getBudgetPeriodRange(new Date("2026-02-28T12:00:00Z"), "monthly", tz);
      expect(result.label).toMatch(/February.*2026/);
    });
  });
});

describe("convertToTargetPeriod", () => {
  it("weekly to monthly: ×4", () => {
    expect(convertToTargetPeriod(50000, "weekly", "monthly")).toBe(200000);
  });

  it("fortnightly to monthly: ×2", () => {
    expect(convertToTargetPeriod(278000, "fortnightly", "monthly")).toBe(556000);
  });

  it("monthly to weekly: ÷4", () => {
    expect(convertToTargetPeriod(200000, "monthly", "weekly")).toBe(50000);
  });

  it("monthly to fortnightly: ÷2", () => {
    expect(convertToTargetPeriod(556000, "monthly", "fortnightly")).toBe(278000);
  });

  it("quarterly to monthly: ÷3", () => {
    expect(convertToTargetPeriod(1200000, "quarterly", "monthly")).toBe(400000);
  });

  it("yearly to monthly: ÷12", () => {
    expect(convertToTargetPeriod(6000000, "yearly", "monthly")).toBe(500000);
  });

  it("yearly to weekly: ÷12 then ÷4", () => {
    expect(convertToTargetPeriod(6000000, "yearly", "weekly")).toBe(125000);
  });

  it("same frequency returns same amount", () => {
    expect(convertToTargetPeriod(100000, "monthly", "monthly")).toBe(100000);
  });

  it("rounds to nearest cent", () => {
    expect(convertToTargetPeriod(100000, "quarterly", "monthly")).toBe(33333);
  });
});

describe("resolveSplitPercentage", () => {
  const ownerUserId = "user-owner";
  const partnerUserId = "user-partner";

  it("equal split: 50% for both", () => {
    const setting = { split_type: "equal" as const };
    expect(resolveSplitPercentage(setting, ownerUserId, ownerUserId)).toBe(50);
    expect(resolveSplitPercentage(setting, partnerUserId, ownerUserId)).toBe(50);
  });

  it("custom split: owner gets owner_percentage", () => {
    const setting = { split_type: "custom" as const, owner_percentage: 70 };
    expect(resolveSplitPercentage(setting, ownerUserId, ownerUserId)).toBe(70);
    expect(resolveSplitPercentage(setting, partnerUserId, ownerUserId)).toBe(30);
  });

  it("individual-owner: 100% for owner, 0% for partner", () => {
    const setting = { split_type: "individual-owner" as const };
    expect(resolveSplitPercentage(setting, ownerUserId, ownerUserId)).toBe(100);
    expect(resolveSplitPercentage(setting, partnerUserId, ownerUserId)).toBe(0);
  });

  it("individual-partner: 0% for owner, 100% for partner", () => {
    const setting = { split_type: "individual-partner" as const };
    expect(resolveSplitPercentage(setting, ownerUserId, ownerUserId)).toBe(0);
    expect(resolveSplitPercentage(setting, partnerUserId, ownerUserId)).toBe(100);
  });

  it("no setting returns 100%", () => {
    expect(resolveSplitPercentage(undefined, ownerUserId, ownerUserId)).toBe(100);
  });
});

describe("calculateIncome", () => {
  const userId = "user-1";
  const periodRange: PeriodRange = {
    start: new Date("2026-02-01"),
    end: new Date("2026-02-28T23:59:59.999Z"),
    label: "February 2026",
  };

  it("sums recurring salary converted to target period", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: userId },
    ];
    expect(calculateIncome(sources, "monthly", "shared", userId, periodRange)).toBe(500000);
  });

  it("converts weekly salary to monthly", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 125000, frequency: "weekly", source_type: "recurring-salary", user_id: userId },
    ];
    expect(calculateIncome(sources, "monthly", "shared", userId, periodRange)).toBe(500000);
  });

  it("includes one-off income if received in period", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: userId },
      { amount_cents: 100000, frequency: "monthly", source_type: "one-off", user_id: userId, is_received: true, received_date: "2026-02-15" },
    ];
    expect(calculateIncome(sources, "monthly", "shared", userId, periodRange)).toBe(600000);
  });

  it("excludes one-off income if not received", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: userId },
      { amount_cents: 100000, frequency: "monthly", source_type: "one-off", user_id: userId, is_received: false },
    ];
    expect(calculateIncome(sources, "monthly", "shared", userId, periodRange)).toBe(500000);
  });

  it("excludes one-off income if received outside period", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 100000, frequency: "monthly", source_type: "one-off", user_id: userId, is_received: true, received_date: "2026-01-15" },
    ];
    expect(calculateIncome(sources, "monthly", "shared", userId, periodRange)).toBe(0);
  });

  it("individual view: excludes partner income", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: userId },
      { amount_cents: 400000, frequency: "monthly", source_type: "recurring-salary", user_id: "partner-id" },
    ];
    expect(calculateIncome(sources, "monthly", "individual", userId, periodRange)).toBe(500000);
  });

  it("individual view: excludes manual partner income", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: userId },
      { amount_cents: 400000, frequency: "monthly", source_type: "recurring-salary", user_id: userId, is_manual_partner_income: true },
    ];
    expect(calculateIncome(sources, "monthly", "individual", userId, periodRange)).toBe(500000);
  });

  it("shared view: includes all income", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: userId },
      { amount_cents: 400000, frequency: "monthly", source_type: "recurring-salary", user_id: "partner-id" },
    ];
    expect(calculateIncome(sources, "monthly", "shared", userId, periodRange)).toBe(900000);
  });

  it("converts to weekly when period is weekly", () => {
    const sources: IncomeSourceInput[] = [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: userId },
    ];
    expect(calculateIncome(sources, "weekly", "shared", userId, periodRange)).toBe(125000);
  });
});

describe("calculateBudgeted", () => {
  it("sums non-zero assignments", () => {
    const assignments: AssignmentInput[] = [
      { category_name: "Food", subcategory_name: "Groceries", assigned_cents: 50000, assignment_type: "category" },
      { category_name: "Housing", subcategory_name: "Rent", assigned_cents: 200000, assignment_type: "category" },
    ];
    expect(calculateBudgeted(assignments, [], [], "monthly", "shared", "user-1", "user-1")).toBe(250000);
  });

  it("ignores seeded $0 rows", () => {
    const assignments: AssignmentInput[] = [
      { category_name: "Food", subcategory_name: "Groceries", assigned_cents: 50000, assignment_type: "category" },
      { category_name: "Food", subcategory_name: "Takeaway", assigned_cents: 0, assignment_type: "category" },
    ];
    expect(calculateBudgeted(assignments, [], [], "monthly", "shared", "user-1", "user-1")).toBe(50000);
  });

  it("adds expense defaults for unassigned subcategories", () => {
    const assignments: AssignmentInput[] = [
      { category_name: "Food", subcategory_name: "Groceries", assigned_cents: 0, assignment_type: "category" },
    ];
    const expenses: ExpenseDefInput[] = [
      { id: "exp-1", category_name: "Food", expected_amount_cents: 30000, recurrence_type: "monthly", inferred_subcategory: "Groceries" },
    ];
    expect(calculateBudgeted(assignments, expenses, [], "monthly", "shared", "user-1", "user-1")).toBe(30000);
  });

  it("does NOT add expense default if subcategory has manual assignment", () => {
    const assignments: AssignmentInput[] = [
      { category_name: "Food", subcategory_name: "Groceries", assigned_cents: 50000, assignment_type: "category" },
    ];
    const expenses: ExpenseDefInput[] = [
      { id: "exp-1", category_name: "Food", expected_amount_cents: 30000, recurrence_type: "monthly", inferred_subcategory: "Groceries" },
    ];
    expect(calculateBudgeted(assignments, expenses, [], "monthly", "shared", "user-1", "user-1")).toBe(50000);
  });

  it("converts expense default to target period", () => {
    const assignments: AssignmentInput[] = [];
    const expenses: ExpenseDefInput[] = [
      { id: "exp-1", category_name: "Food", expected_amount_cents: 30000, recurrence_type: "weekly", inferred_subcategory: "Groceries" },
    ];
    expect(calculateBudgeted(assignments, expenses, [], "monthly", "shared", "user-1", "user-1")).toBe(120000);
  });

  it("applies split to expense default in individual view", () => {
    const assignments: AssignmentInput[] = [];
    const expenses: ExpenseDefInput[] = [
      { id: "exp-1", category_name: "Food", expected_amount_cents: 100000, recurrence_type: "monthly", inferred_subcategory: "Groceries" },
    ];
    const splits: SplitSettingInput[] = [
      { expense_definition_id: "exp-1", split_type: "equal" },
    ];
    expect(calculateBudgeted(assignments, expenses, splits, "monthly", "individual", "user-1", "user-1")).toBe(50000);
  });

  it("includes goal and asset assignments", () => {
    const assignments: AssignmentInput[] = [
      { category_name: "", assignment_type: "goal", goal_id: "goal-1", assigned_cents: 20000 },
      { category_name: "", assignment_type: "asset", asset_id: "asset-1", assigned_cents: 10000 },
    ];
    expect(calculateBudgeted(assignments, [], [], "monthly", "shared", "user-1", "user-1")).toBe(30000);
  });
});

describe("calculateSpent", () => {
  const mappings: CategoryMapping[] = [
    { up_category_id: "groceries", new_parent_name: "Food & Dining", new_child_name: "Groceries" },
    { up_category_id: "rent", new_parent_name: "Housing", new_child_name: "Rent" },
  ];

  it("groups spending by subcategory", () => {
    const txns: TransactionInput[] = [
      { id: "t1", amount_cents: -5000, category_id: "groceries", created_at: "2026-02-10" },
      { id: "t2", amount_cents: -3000, category_id: "groceries", created_at: "2026-02-12" },
      { id: "t3", amount_cents: -100000, category_id: "rent", created_at: "2026-02-01" },
    ];
    const result = calculateSpent(txns, mappings, [], "shared", "user-1", "user-1");
    expect(result.get("Food & Dining::Groceries")).toBe(8000);
    expect(result.get("Housing::Rent")).toBe(100000);
  });

  it("ignores positive transactions (income)", () => {
    const txns: TransactionInput[] = [
      { id: "t1", amount_cents: 500000, category_id: "groceries", created_at: "2026-02-10", is_income: true },
      { id: "t2", amount_cents: -5000, category_id: "groceries", created_at: "2026-02-12" },
    ];
    const result = calculateSpent(txns, mappings, [], "shared", "user-1", "user-1");
    expect(result.get("Food & Dining::Groceries")).toBe(5000);
  });

  it("returns absolute values (positive = spending)", () => {
    const txns: TransactionInput[] = [
      { id: "t1", amount_cents: -5000, category_id: "groceries", created_at: "2026-02-10" },
    ];
    const result = calculateSpent(txns, mappings, [], "shared", "user-1", "user-1");
    expect(result.get("Food & Dining::Groceries")).toBe(5000);
  });

  it("applies split in individual view", () => {
    const txns: TransactionInput[] = [
      { id: "t1", amount_cents: -10000, category_id: "groceries", created_at: "2026-02-10" },
    ];
    const splits: SplitSettingInput[] = [
      { category_name: "Food & Dining", split_type: "equal" },
    ];
    const result = calculateSpent(txns, mappings, splits, "individual", "user-1", "user-1");
    expect(result.get("Food & Dining::Groceries")).toBe(5000);
  });

  it("transaction split override takes priority", () => {
    const txns: TransactionInput[] = [
      { id: "t1", amount_cents: -10000, category_id: "groceries", created_at: "2026-02-10", split_override_percentage: 30 },
    ];
    const splits: SplitSettingInput[] = [
      { category_name: "Food & Dining", split_type: "equal" },
    ];
    const result = calculateSpent(txns, mappings, splits, "individual", "user-1", "user-1");
    expect(result.get("Food & Dining::Groceries")).toBe(3000);
  });

  it("skips transactions with unknown category", () => {
    const txns: TransactionInput[] = [
      { id: "t1", amount_cents: -5000, category_id: "unknown-cat", created_at: "2026-02-10" },
    ];
    const result = calculateSpent(txns, mappings, [], "shared", "user-1", "user-1");
    expect(result.size).toBe(0);
  });

  it("returns total spent across all categories", () => {
    const txns: TransactionInput[] = [
      { id: "t1", amount_cents: -5000, category_id: "groceries", created_at: "2026-02-10" },
      { id: "t2", amount_cents: -100000, category_id: "rent", created_at: "2026-02-01" },
    ];
    const result = calculateSpent(txns, mappings, [], "shared", "user-1", "user-1");
    const totalSpent = Array.from(result.values()).reduce((a, b) => a + b, 0);
    expect(totalSpent).toBe(105000);
  });
});

describe("calculateCarryover", () => {
  it("always returns 0 (fresh each period)", () => {
    expect(calculateCarryover({
      mode: "none",
      prevIncome: 500000,
      prevCarryover: 100000,
      prevBudgeted: 200000,
      prevSpent: 100000,
    })).toBe(0);
  });
});

describe("calculateBudgetSummary", () => {
  const baseInput: BudgetSummaryInput = {
    periodType: "monthly",
    budgetView: "shared",
    carryoverMode: "none",
    methodology: "zero-based",
    totalBudget: null,
    userId: "user-1",
    ownerUserId: "user-1",
    periodRange: {
      start: new Date("2026-02-01"),
      end: new Date("2026-02-28T23:59:59.999Z"),
      label: "February 2026",
    },
    incomeSources: [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-1" },
    ],
    assignments: [
      { category_name: "Food & Dining", subcategory_name: "Groceries", assigned_cents: 50000, assignment_type: "category" },
      { category_name: "Housing & Utilities", subcategory_name: "Rent", assigned_cents: 200000, assignment_type: "category" },
    ],
    transactions: [
      { id: "t1", amount_cents: -4000, category_id: "groceries", created_at: "2026-02-10" },
      { id: "t2", amount_cents: -195000, category_id: "rent", created_at: "2026-02-01" },
    ],
    expenseDefinitions: [],
    splitSettings: [],
    categoryMappings: [
      { up_category_id: "groceries", new_parent_name: "Food & Dining", new_child_name: "Groceries" },
      { up_category_id: "rent", new_parent_name: "Housing & Utilities", new_child_name: "Rent" },
    ],
    carryoverFromPrevious: 0,
  };

  it("calculates correct TBB", () => {
    const result = calculateBudgetSummary(baseInput);
    expect(result.income).toBe(500000);
    expect(result.budgeted).toBe(250000);
    expect(result.carryover).toBe(0);
    expect(result.tbb).toBe(250000); // 500000 + 0 - 250000
  });

  it("calculates spent from transactions", () => {
    const result = calculateBudgetSummary(baseInput);
    expect(result.spent).toBe(199000); // 4000 + 195000
  });

  it("builds rows per subcategory", () => {
    const result = calculateBudgetSummary(baseInput);
    const groceries = result.rows.find((r) => r.name === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.budgeted).toBe(50000);
    expect(groceries!.spent).toBe(4000);
    expect(groceries!.available).toBe(46000);
  });

  it("includes carryover in TBB", () => {
    const input = { ...baseInput, carryoverFromPrevious: 30000 };
    const result = calculateBudgetSummary(input);
    expect(result.tbb).toBe(280000); // 500000 + 30000 - 250000
  });

  it("custom budget uses totalBudget instead of income", () => {
    const input = { ...baseInput, totalBudget: 300000, incomeSources: [] };
    const result = calculateBudgetSummary(input);
    expect(result.income).toBe(300000);
    expect(result.tbb).toBe(50000); // 300000 + 0 - 250000
  });

  it("marks expense default rows", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assignments: [], // no manual assignments
      expenseDefinitions: [
        { id: "exp-1", category_name: "Food & Dining", expected_amount_cents: 30000, recurrence_type: "monthly", inferred_subcategory: "Groceries" },
      ],
    };
    const result = calculateBudgetSummary(input);
    const groceries = result.rows.find((r) => r.name === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.isExpenseDefault).toBe(true);
    expect(groceries!.budgeted).toBe(30000);
  });

  it("expense default overrides $0 manual assignment", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assignments: [
        { category_name: "Food & Dining", subcategory_name: "Groceries", assigned_cents: 0, assignment_type: "category" },
      ],
      expenseDefinitions: [
        { id: "exp-1", category_name: "Food & Dining", expected_amount_cents: 30000, recurrence_type: "monthly", inferred_subcategory: "Groceries" },
      ],
    };
    const result = calculateBudgetSummary(input);
    const groceries = result.rows.find((r) => r.name === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.isExpenseDefault).toBe(true);
    expect(groceries!.budgeted).toBe(30000);
  });

  it("creates rows for unmatched transactions", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assignments: [], // no assignments for groceries or rent
      expenseDefinitions: [],
    };
    const result = calculateBudgetSummary(input);
    const groceries = result.rows.find((r) => r.name === "Groceries");
    expect(groceries).toBeDefined();
    expect(groceries!.budgeted).toBe(0);
    expect(groceries!.spent).toBe(4000);
    expect(groceries!.available).toBe(-4000);
  });
});

describe("goal and asset contributions", () => {
  const baseInput: BudgetSummaryInput = {
    periodType: "monthly",
    budgetView: "shared",
    carryoverMode: "none",
    methodology: "zero-based",
    totalBudget: null,
    userId: "user-1",
    ownerUserId: "user-1",
    periodRange: {
      start: new Date("2026-02-01"),
      end: new Date("2026-02-28T23:59:59.999Z"),
      label: "February 2026",
    },
    incomeSources: [
      { amount_cents: 500000, frequency: "monthly", source_type: "recurring-salary", user_id: "user-1" },
    ],
    assignments: [],
    transactions: [],
    expenseDefinitions: [],
    splitSettings: [],
    categoryMappings: [],
    carryoverFromPrevious: 0,
  };

  it("goal row with contributions shows spent amount", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assignments: [
        { category_name: "", assignment_type: "goal", goal_id: "goal-1", assigned_cents: 50000 },
      ],
      goals: [{ id: "goal-1", name: "Emergency Fund", icon: "shield", target: 1000000, currentAmount: 500000 }],
      goalContributions: new Map([["goal-1", 30000]]),
    };
    const result = calculateBudgetSummary(input);
    const goalRow = result.rows.find(r => r.id === "goal::goal-1");
    expect(goalRow).toBeDefined();
    expect(goalRow!.spent).toBe(30000);
    expect(goalRow!.available).toBe(20000); // 50000 - 30000
  });

  it("asset row with contributions shows spent amount", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assignments: [
        { category_name: "", assignment_type: "asset", asset_id: "asset-1", assigned_cents: 20000 },
      ],
      assets: [{ id: "asset-1", name: "VAS ETF", assetType: "etf", currentValue: 500000 }],
      assetContributions: new Map([["asset-1", 20000]]),
    };
    const result = calculateBudgetSummary(input);
    const assetRow = result.rows.find(r => r.id === "asset::asset-1");
    expect(assetRow).toBeDefined();
    expect(assetRow!.spent).toBe(20000);
    expect(assetRow!.available).toBe(0); // 20000 - 20000
  });

  it("goal row without contributions keeps spent at 0", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assignments: [
        { category_name: "", assignment_type: "goal", goal_id: "goal-1", assigned_cents: 50000 },
      ],
      goals: [{ id: "goal-1", name: "Emergency Fund", icon: "shield", target: 1000000, currentAmount: 500000 }],
    };
    const result = calculateBudgetSummary(input);
    const goalRow = result.rows.find(r => r.id === "goal::goal-1");
    expect(goalRow!.spent).toBe(0);
    expect(goalRow!.available).toBe(50000);
  });

  it("asset row without contributions keeps spent at 0", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assignments: [
        { category_name: "", assignment_type: "asset", asset_id: "asset-1", assigned_cents: 20000 },
      ],
      assets: [{ id: "asset-1", name: "VAS ETF", assetType: "etf", currentValue: 500000 }],
    };
    const result = calculateBudgetSummary(input);
    const assetRow = result.rows.find(r => r.id === "asset::asset-1");
    expect(assetRow!.spent).toBe(0);
    expect(assetRow!.available).toBe(20000);
  });

  it("default goal row (no assignment) shows contributions", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      goals: [{ id: "goal-1", name: "Emergency Fund", icon: "shield", target: 1000000, currentAmount: 500000 }],
      goalContributions: new Map([["goal-1", 30000]]),
    };
    const result = calculateBudgetSummary(input);
    const goalRow = result.rows.find(r => r.id === "goal::goal-1");
    expect(goalRow).toBeDefined();
    expect(goalRow!.budgeted).toBe(0);
    expect(goalRow!.spent).toBe(30000);
    expect(goalRow!.available).toBe(-30000);
  });

  it("default asset row (no assignment) shows contributions", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      assets: [{ id: "asset-1", name: "VAS ETF", assetType: "etf", currentValue: 500000 }],
      assetContributions: new Map([["asset-1", 15000]]),
    };
    const result = calculateBudgetSummary(input);
    const assetRow = result.rows.find(r => r.id === "asset::asset-1");
    expect(assetRow).toBeDefined();
    expect(assetRow!.budgeted).toBe(0);
    expect(assetRow!.spent).toBe(15000);
    expect(assetRow!.available).toBe(-15000);
  });

  it("summary.spent includes goal and asset contributions alongside transaction spending", () => {
    const input: BudgetSummaryInput = {
      ...baseInput,
      transactions: [
        { id: "t1", amount_cents: -4000, category_id: "groceries", created_at: "2026-02-10" },
      ],
      categoryMappings: [
        { up_category_id: "groceries", new_parent_name: "Food & Dining", new_child_name: "Groceries" },
      ],
      assignments: [
        { category_name: "Food & Dining", subcategory_name: "Groceries", assigned_cents: 50000, assignment_type: "category" },
        { category_name: "", assignment_type: "goal", goal_id: "goal-1", assigned_cents: 50000 },
        { category_name: "", assignment_type: "asset", asset_id: "asset-1", assigned_cents: 20000 },
      ],
      goals: [{ id: "goal-1", name: "Emergency Fund", icon: "shield", target: 1000000, currentAmount: 500000 }],
      assets: [{ id: "asset-1", name: "VAS ETF", assetType: "etf", currentValue: 500000 }],
      goalContributions: new Map([["goal-1", 30000]]),
      assetContributions: new Map([["asset-1", 20000]]),
    };
    const result = calculateBudgetSummary(input);
    // 4000 (groceries txn) + 30000 (goal contribution) + 20000 (asset contribution)
    expect(result.spent).toBe(54000);
  });
});

describe("period navigation", () => {
  describe("getNextPeriodDate (UTC)", () => {
    it("monthly: advances to next month", () => {
      const result = getNextPeriodDate(new Date("2026-02-15"), "monthly", "UTC");
      expect(result.getUTCMonth()).toBe(2); // March
      expect(result.getUTCDate()).toBe(1);
    });

    it("weekly: advances to next week boundary", () => {
      const result = getNextPeriodDate(new Date("2026-02-03"), "weekly", "UTC");
      expect(result.getUTCDate()).toBe(8);
    });

    it("weekly: week 4 wraps to next month week 1", () => {
      const result = getNextPeriodDate(new Date("2026-02-25"), "weekly", "UTC");
      expect(result.getUTCMonth()).toBe(2); // March
      expect(result.getUTCDate()).toBe(1);
    });

    it("fortnightly: first half to second half", () => {
      const result = getNextPeriodDate(new Date("2026-02-08"), "fortnightly", "UTC");
      expect(result.getUTCDate()).toBe(15);
    });

    it("fortnightly: second half wraps to next month", () => {
      const result = getNextPeriodDate(new Date("2026-02-20"), "fortnightly", "UTC");
      expect(result.getUTCMonth()).toBe(2); // March
      expect(result.getUTCDate()).toBe(1);
    });
  });

  describe("getNextPeriodDate (timezone-aware)", () => {
    const tz = "Australia/Sydney";

    it("monthly: returns midnight of next month in timezone", () => {
      const result = getNextPeriodDate(new Date("2026-02-15T00:00:00Z"), "monthly", tz);
      const components = getDateComponentsInTimezone(result, tz);
      expect(components.month).toBe(2); // March
      expect(components.day).toBe(1);
    });
  });

  describe("getPreviousPeriodDate (UTC)", () => {
    it("monthly: goes to previous month", () => {
      const result = getPreviousPeriodDate(new Date("2026-02-15"), "monthly", "UTC");
      expect(result.getUTCMonth()).toBe(0); // January
    });

    it("weekly: week 2 goes to week 1", () => {
      const result = getPreviousPeriodDate(new Date("2026-02-10"), "weekly", "UTC");
      expect(result.getUTCDate()).toBe(1);
    });

    it("weekly: week 1 goes to previous month week 4", () => {
      const result = getPreviousPeriodDate(new Date("2026-02-03"), "weekly", "UTC");
      expect(result.getUTCMonth()).toBe(0); // January
      expect(result.getUTCDate()).toBe(22);
    });
  });

  describe("getMonthKeyForPeriod", () => {
    it("returns ISO month key for period date (UTC)", () => {
      expect(getMonthKeyForPeriod(new Date("2026-02-15"), "UTC")).toBe("2026-02-01");
    });

    it("respects timezone when date is near month boundary", () => {
      // Feb 28 at 2pm UTC = March 1 at 1am AEDT
      expect(getMonthKeyForPeriod(new Date("2026-02-28T14:00:00Z"), "Australia/Sydney")).toBe("2026-03-01");
      // Feb 28 at noon UTC = Feb 28 at 11pm AEDT
      expect(getMonthKeyForPeriod(new Date("2026-02-28T12:00:00Z"), "Australia/Sydney")).toBe("2026-02-01");
    });
  });
});

describe("timezone helpers", () => {
  it("DEFAULT_BUDGET_TIMEZONE is Australia/Sydney", () => {
    expect(DEFAULT_BUDGET_TIMEZONE).toBe("Australia/Sydney");
  });

  it("getDateComponentsInTimezone extracts correct date in AEDT", () => {
    // Feb 28 at 2pm UTC = March 1 at 1am AEDT (UTC+11 in summer)
    const { year, month, day } = getDateComponentsInTimezone(
      new Date("2026-02-28T14:00:00Z"),
      "Australia/Sydney"
    );
    expect(year).toBe(2026);
    expect(month).toBe(2); // March (0-indexed)
    expect(day).toBe(1);
  });

  it("getDateComponentsInTimezone: same date in UTC", () => {
    const { year, month, day } = getDateComponentsInTimezone(
      new Date("2026-02-28T14:00:00Z"),
      "UTC"
    );
    expect(year).toBe(2026);
    expect(month).toBe(1); // February (0-indexed)
    expect(day).toBe(28);
  });

  it("midnightInTimezone returns correct UTC instant for AEDT", () => {
    // March 1 midnight AEDT (UTC+11) = Feb 28 13:00 UTC
    const result = midnightInTimezone(2026, 2, 1, "Australia/Sydney");
    expect(result.toISOString()).toBe("2026-02-28T13:00:00.000Z");
  });

  it("midnightInTimezone in UTC is just UTC midnight", () => {
    const result = midnightInTimezone(2026, 2, 1, "UTC");
    expect(result.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
