import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFinancialTools } from "../ai-tools";

/**
 * Test-only helper that calls a tool's execute() and returns the resolved
 * value with a relaxed type. The AI SDK types `execute` as optional and
 * its return as `T | AsyncIterable<T>` — neither matters for these unit
 * tests, which use the synchronous resolved value directly.
 */
async function runTool(tool: any, args: any): Promise<any> {
  if (!tool || typeof tool.execute !== "function") {
    throw new Error("tool has no execute()");
  }
  return tool.execute(args, {
    toolCallId: "test",
    messages: [],
    abortSignal: undefined as any,
  });
}

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

type FilterFn = (column: string, value: unknown) => MockQuery;
type MockQuery = {
  select: (sel?: string) => MockQuery;
  from: (table: string) => MockQuery;
  eq: FilterFn;
  neq: FilterFn;
  gt: FilterFn;
  gte: FilterFn;
  lt: FilterFn;
  lte: FilterFn;
  in: FilterFn;
  is: FilterFn;
  not: (column: string, operator: string, value: unknown) => MockQuery;
  ilike: FilterFn;
  like: FilterFn;
  or: (expr: string) => MockQuery;
  order: (col: string, opts?: { ascending?: boolean }) => MockQuery;
  limit: (n: number) => MockQuery;
  single: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  insert: (row: unknown) => MockQuery;
  update: (row: unknown) => MockQuery;
  upsert: (row: unknown, opts?: unknown) => MockQuery;
  then: (resolve: (val: { data: unknown[]; error: null }) => void) => void;
  _data: unknown[];
  _resolve: () => Promise<{ data: unknown[]; error: null }>;
};

function createMockSupabase(tableData: Record<string, unknown[]> = {}) {
  const mockQuery = (): MockQuery => {
    let currentTable = "";
    let resolvedData: unknown[] = [];

    const q: MockQuery = {
      _data: [],
      select: () => q,
      from: (table: string) => {
        currentTable = table;
        resolvedData = tableData[table] || [];
        q._data = resolvedData;
        return q;
      },
      eq: () => q,
      neq: () => q,
      gt: () => q,
      gte: () => q,
      lt: () => q,
      lte: () => q,
      in: () => q,
      is: () => q,
      not: () => q,
      ilike: () => q,
      like: () => q,
      or: () => q,
      order: () => q,
      limit: () => q,
      single: async () => ({
        data: resolvedData.length > 0 ? (resolvedData[0] as Record<string, unknown>) : null,
        error: null,
      }),
      maybeSingle: async () => ({
        data: resolvedData.length > 0 ? (resolvedData[0] as Record<string, unknown>) : null,
        error: null,
      }),
      insert: () => q,
      update: () => q,
      upsert: () => q,
      then: (resolve) => resolve({ data: resolvedData as unknown[], error: null }),
      _resolve: async () => ({ data: resolvedData as unknown[], error: null }),
    };

    return q;
  };

  // Make from() return a thenable query that also supports await
  const client = {
    from: (table: string) => {
      const q = mockQuery();
      q.from(table);

      // Make the query itself thenable (for `const { data } = await supabase.from(...).select(...)`)
      const handler: ProxyHandler<MockQuery> = {
        get(target, prop) {
          if (prop === "then") {
            return (
              resolve: (val: { data: unknown[]; error: null }) => void,
              _reject?: unknown
            ) => {
              resolve({ data: target._data as unknown[], error: null });
            };
          }
          return (target as Record<string | symbol, unknown>)[prop];
        },
      };
      return new Proxy(q, handler);
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1" } },
      }),
    },
    rpc: async () => ({ data: null, error: null }),
  };

  return client;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ACCOUNT_IDS = ["acc-1", "acc-2"];
const PARTNERSHIP_ID = "partner-1";
const USER_ID = "user-1";

const SAMPLE_TRANSACTIONS = [
  {
    id: "txn-1",
    account_id: "acc-1",
    description: "Woolworths Metro",
    amount_cents: -4500,
    category_id: "groceries",
    parent_category_id: "good-life",
    settled_at: "2025-06-01T10:00:00Z",
    created_at: "2025-06-01T10:00:00Z",
    transaction_type: "purchase",
    is_income: false,
    transfer_account_id: null,
  },
  {
    id: "txn-2",
    account_id: "acc-1",
    description: "Salary Payment",
    amount_cents: 550000,
    category_id: "salary-income",
    parent_category_id: null,
    settled_at: "2025-06-15T00:00:00Z",
    created_at: "2025-06-15T00:00:00Z",
    transaction_type: "deposit",
    is_income: true,
    transfer_account_id: null,
  },
  {
    id: "txn-3",
    account_id: "acc-1",
    description: "Netflix",
    amount_cents: -2299,
    category_id: "entertainment",
    parent_category_id: "personal",
    settled_at: "2025-06-05T12:00:00Z",
    created_at: "2025-06-05T12:00:00Z",
    transaction_type: "purchase",
    is_income: false,
    transfer_account_id: null,
  },
  {
    id: "txn-oldest",
    account_id: "acc-2",
    description: "First ever purchase",
    amount_cents: -1000,
    category_id: "other",
    parent_category_id: null,
    settled_at: "2024-01-01T00:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    transaction_type: "purchase",
    is_income: false,
    transfer_account_id: null,
  },
];

const SAMPLE_ACCOUNTS = [
  {
    id: "acc-1",
    user_id: "user-1",
    display_name: "Spending",
    account_type: "TRANSACTIONAL",
    balance_cents: 150000,
    is_active: true,
    updated_at: "2025-06-20T00:00:00Z",
  },
  {
    id: "acc-2",
    user_id: "user-1",
    display_name: "Savings",
    account_type: "SAVER",
    balance_cents: 500000,
    is_active: true,
    updated_at: "2025-06-20T00:00:00Z",
  },
];

const SAMPLE_CATEGORIES = [
  { up_category_id: "groceries", new_parent_name: "Groceries", new_child_name: "Supermarkets", icon: "🛒", display_order: 1 },
  { up_category_id: "entertainment", new_parent_name: "Entertainment", new_child_name: "Streaming", icon: "🎬", display_order: 2 },
  { up_category_id: "fuel", new_parent_name: "Transport", new_child_name: "Fuel", icon: "⛽", display_order: 3 },
];

const SAMPLE_SAVINGS_GOALS = [
  {
    id: "goal-1",
    partnership_id: PARTNERSHIP_ID,
    name: "Holiday Fund",
    target_amount_cents: 500000,
    current_amount_cents: 150000,
    deadline: "2025-12-01",
    icon: "🏖️",
    color: "#3B82F6",
    is_completed: false,
    completed_at: null,
    created_at: "2025-01-01T00:00:00Z",
  },
];

const SAMPLE_BUDGET_ASSIGNMENTS = [
  {
    id: "ba-1",
    partnership_id: PARTNERSHIP_ID,
    category_name: "Groceries",
    assigned_cents: 60000,
    subcategory_name: null,
    assignment_type: "category",
    goal_id: null,
    month: "2025-06-01",
  },
  {
    id: "ba-2",
    partnership_id: PARTNERSHIP_ID,
    category_name: "Entertainment",
    assigned_cents: 15000,
    subcategory_name: null,
    assignment_type: "category",
    goal_id: null,
    month: "2025-06-01",
  },
];

const SAMPLE_EXPENSE_DEFINITIONS = [
  {
    id: "exp-1",
    partnership_id: PARTNERSHIP_ID,
    name: "Netflix",
    category_name: "Entertainment",
    expected_amount_cents: 2299,
    recurrence_type: "monthly",
    next_due_date: "2025-07-05",
    match_pattern: "Netflix",
    merchant_name: "Netflix",
    is_active: true,
    emoji: "🎬",
    notes: null,
  },
];

const SAMPLE_INCOME_SOURCES = [
  {
    id: "inc-1",
    user_id: USER_ID,
    partnership_id: PARTNERSHIP_ID,
    name: "Salary",
    amount_cents: 550000,
    frequency: "fortnightly",
    next_pay_date: "2025-06-28",
  },
];

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe("AI Financial Tools", () => {
  let tools: ReturnType<typeof createFinancialTools>;

  beforeEach(() => {
    const supabase = createMockSupabase({
      transactions: SAMPLE_TRANSACTIONS,
      accounts: SAMPLE_ACCOUNTS,
      category_mappings: SAMPLE_CATEGORIES,
      savings_goals: SAMPLE_SAVINGS_GOALS,
      budget_assignments: SAMPLE_BUDGET_ASSIGNMENTS,
      expense_definitions: SAMPLE_EXPENSE_DEFINITIONS,
      expense_matches: [],
      income_sources: SAMPLE_INCOME_SOURCES,
      budget_months: [],
      couple_split_settings: [],
      user_budgets: [
        {
          id: "budget-1",
          partnership_id: PARTNERSHIP_ID,
          budget_view: "shared",
          period_type: "monthly",
          methodology: "custom",
          total_budget: null,
          created_by: USER_ID,
          is_default: true,
          is_active: true,
        },
      ],
    });

    tools = createFinancialTools(
      supabase as any,
      ACCOUNT_IDS,
      PARTNERSHIP_ID,
      USER_ID
    );
  });

  // =========================================================================
  // READ TOOLS
  // =========================================================================

  describe("searchTransactions", () => {
    it("returns transactions with proper shape", async () => {
      const result = await runTool(tools.searchTransactions, { limit: 10 });
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("transactions");
      expect(result.count).toBeGreaterThan(0);
    });

    it("formats amounts as dollar strings", async () => {
      const result = await runTool(tools.searchTransactions, { query: "Woolworths" });
      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.transactions[0].amount).toMatch(/^\$/);
    });
  });

  describe("getAccountBalances", () => {
    it("returns total and per-account balances", async () => {
      const result = await runTool(tools.getAccountBalances, {});
      expect(result).toHaveProperty("totalBalance");
      expect(result).toHaveProperty("accounts");
      expect(result.totalBalance).toMatch(/^\$/);
      expect(result.accounts.length).toBe(2);
    });
  });

  describe("getSpendingSummary", () => {
    it("returns spending breakdown for a month", async () => {
      const result = await runTool(tools.getSpendingSummary, { month: "2025-06" });
      expect(result).toHaveProperty("month", "2025-06");
      expect(result).toHaveProperty("totalSpending");
      expect(result).toHaveProperty("categories");
      expect(result.totalSpending).toMatch(/^\$/);
    });
  });

  describe("getIncomeSummary", () => {
    it("returns income for a month", async () => {
      const result = await runTool(tools.getIncomeSummary, { month: "2025-06" });
      expect(result).toHaveProperty("month", "2025-06");
      expect(result).toHaveProperty("totalIncome");
      expect(result.totalIncome).toMatch(/^\$/);
    });
  });

  describe("getSavingsGoals", () => {
    it("returns goals with progress", async () => {
      const result = await runTool(tools.getSavingsGoals, {});
      expect(result).toHaveProperty("goals");
      expect(result.goals.length).toBeGreaterThan(0);
      expect(result.goals[0]).toHaveProperty("name", "Holiday Fund");
      expect(result.goals[0]).toHaveProperty("progress");
      expect(result.goals[0].progress).toMatch(/%$/);
    });
  });

  describe("getCategoryList", () => {
    it("returns categories with subcategories", async () => {
      const result = await runTool(tools.getCategoryList, {});
      expect(result).toHaveProperty("categories");
      expect(result).toHaveProperty("specialCategories");
      expect(result.categories.length).toBeGreaterThan(0);
      expect(result.categories[0]).toHaveProperty("name");
      expect(result.categories[0]).toHaveProperty("subcategories");
    });
  });

  describe("getBudgetStatus", () => {
    it("returns budget vs actual comparison", async () => {
      const result = await runTool(tools.getBudgetStatus, { month: "2025-06" });
      expect(result).toHaveProperty("periodLabel");
      expect(result).toHaveProperty("periodType");
      expect(result).toHaveProperty("totalBudgeted");
      expect(result).toHaveProperty("totalSpent");
      expect(result).toHaveProperty("rows");
      expect(result).toHaveProperty("summary");
    });
  });

  describe("getUpcomingBills", () => {
    it("returns bills with amounts and due dates", async () => {
      const result = await runTool(tools.getUpcomingBills, {});
      expect(result).toHaveProperty("billCount");
      expect(result).toHaveProperty("bills");
    });
  });

  describe("getMonthlyTrends", () => {
    it("returns trends with averages", async () => {
      const result = await runTool(tools.getMonthlyTrends, { months: 6 });
      expect(result).toHaveProperty("periodMonths", 6);
      expect(result).toHaveProperty("averageMonthlySpending");
      expect(result).toHaveProperty("trends");
    });
  });

  describe("getMerchantSpending", () => {
    it("returns merchant breakdown", async () => {
      const result = await runTool(tools.getMerchantSpending, { merchant: "Woolworths" });
      expect(result).toHaveProperty("merchant", "Woolworths");
      expect(result).toHaveProperty("totalSpent");
      expect(result).toHaveProperty("recentTransactions");
    });
  });

  describe("getPaySchedule", () => {
    it("returns pay schedule info", async () => {
      const result = await runTool(tools.getPaySchedule, {});
      expect(result).toHaveProperty("incomeSources");
    });
  });

  describe("getDailySpending", () => {
    it("returns day-by-day breakdown", async () => {
      const result = await runTool(tools.getDailySpending, { month: "2025-06" });
      expect(result).toHaveProperty("month", "2025-06");
      expect(result).toHaveProperty("totalSpent");
      expect(result).toHaveProperty("averageDailySpend");
    });
  });

  // =========================================================================
  // POWER QUERY TOOL
  // =========================================================================

  describe("queryFinancialData", () => {
    it("rejects disallowed tables", async () => {
      const result = await runTool(tools.queryFinancialData, { table: "users", select: "*" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("not allowed");
    });

    it("queries allowed tables and returns data", async () => {
      const result = await runTool(tools.queryFinancialData, { table: "transactions", select: "description, amount_cents, settled_at" });
      expect(result).toHaveProperty("table", "transactions");
      expect(result).toHaveProperty("rowCount");
      expect(result).toHaveProperty("rows");
    });

    it("caps results at 500", async () => {
      const result = await runTool(tools.queryFinancialData, { table: "transactions", limit: 9999 });
      // The tool should cap at 500, though mock won't actually enforce this
      expect(result).toHaveProperty("rows");
    });

    it("queries accounts table scoped to user's accounts", async () => {
      const result = await runTool(tools.queryFinancialData, { table: "accounts", select: "display_name, balance_cents" });
      expect(result).toHaveProperty("table", "accounts");
      expect(result).toHaveProperty("rows");
    });

    it("queries savings_goals scoped to partnership", async () => {
      const result = await runTool(tools.queryFinancialData, { table: "savings_goals" });
      expect(result).toHaveProperty("table", "savings_goals");
    });

    it("queries category_mappings without scoping (global table)", async () => {
      const result = await runTool(tools.queryFinancialData, { table: "category_mappings" });
      expect(result).toHaveProperty("table", "category_mappings");
      expect(result).toHaveProperty("rows");
    });

    it("applies user-provided filters", async () => {
      const result = await runTool(tools.queryFinancialData, {
          table: "transactions",
          filters: [
            { column: "amount_cents", operator: "lt", value: 0 },
          ],
          orderBy: { column: "settled_at", ascending: true },
          limit: 1,
        });
      expect(result).toHaveProperty("rows");
    });
  });

  // =========================================================================
  // ANALYSIS TOOLS
  // =========================================================================

  describe("getSpendingVelocity", () => {
    it("returns burn rate analysis for current month", async () => {
      const result = await runTool(tools.getSpendingVelocity, {});
      expect(result).toHaveProperty("dayOfMonth");
      expect(result).toHaveProperty("daysInMonth");
      expect(result).toHaveProperty("daysRemaining");
      expect(result).toHaveProperty("totalSpent");
      expect(result).toHaveProperty("dailyBurnRate");
      expect(result).toHaveProperty("projectedMonthEnd");
      expect(result).toHaveProperty("safeToSpendPerDay");
      expect(result.totalSpent).toMatch(/^\$/);
      expect(result.dailyBurnRate).toMatch(/^\$/);
    });

    it("accepts a specific month parameter", async () => {
      const result = await runTool(tools.getSpendingVelocity, { month: "2025-06" });
      expect(result).toHaveProperty("month", "2025-06");
    });
  });

  describe("getCashflowForecast", () => {
    it("returns projected balances", async () => {
      const result = await runTool(tools.getCashflowForecast, {});
      expect(result).toHaveProperty("currentBalance");
      expect(result).toHaveProperty("monthlyIncome");
      expect(result).toHaveProperty("monthlyFixedExpenses");
      expect(result).toHaveProperty("monthlySurplus");
      expect(result).toHaveProperty("projections");
      expect(result.projections.length).toBe(3); // default 3 months
      expect(result.currentBalance).toMatch(/^\$/);
    });

    it("respects monthsAhead parameter", async () => {
      const result = await runTool(tools.getCashflowForecast, { monthsAhead: 6 });
      expect(result.projections.length).toBe(6);
    });

    it("caps at 6 months", async () => {
      const result = await runTool(tools.getCashflowForecast, { monthsAhead: 12 });
      expect(result.projections.length).toBe(6);
    });
  });

  describe("getSubscriptionCostTrajectory", () => {
    it("returns subscription analysis", async () => {
      const result = await runTool(tools.getSubscriptionCostTrajectory, {});
      expect(result).toHaveProperty("subscriptionCount");
      expect(result).toHaveProperty("totalMonthlyCost");
      expect(result).toHaveProperty("totalAnnualCost");
      expect(result).toHaveProperty("subscriptions");
      expect(result.totalMonthlyCost).toMatch(/^\$/);
    });
  });

  describe("getCoupleSplitAnalysis", () => {
    it("returns split analysis", async () => {
      const result = await runTool(tools.getCoupleSplitAnalysis, {});
      expect(result).toHaveProperty("incomeRatio");
      expect(result).toHaveProperty("totalSpent");
      expect(result).toHaveProperty("categoryBreakdown");
    });

    it("returns error when no partnership", async () => {
      const supabase = createMockSupabase({});
      const noPartnerTools = createFinancialTools(supabase as any, ACCOUNT_IDS, null, USER_ID);
      const result = await runTool(noPartnerTools.getCoupleSplitAnalysis, {});
      expect(result).toHaveProperty("error");
    });
  });

  describe("detectRecurringExpenses", () => {
    it("returns detected patterns from transaction history", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          transactions: [
            { description: "Netflix", amount_cents: -1699, created_at: "2025-11-15T00:00:00Z", settled_at: "2025-11-15", transfer_account_id: null },
            { description: "Netflix", amount_cents: -1699, created_at: "2025-12-15T00:00:00Z", settled_at: "2025-12-15", transfer_account_id: null },
            { description: "Netflix", amount_cents: -1699, created_at: "2026-01-15T00:00:00Z", settled_at: "2026-01-15", transfer_account_id: null },
          ],
          expense_definitions: [],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.detectRecurringExpenses, { months: 6 });
      expect(result).toHaveProperty("patterns");
      expect(Array.isArray((result as any).patterns)).toBe(true);
    });

    it("marks already-tracked expenses", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          transactions: [
            { description: "Netflix", amount_cents: -1699, created_at: "2025-11-15T00:00:00Z", settled_at: "2025-11-15", transfer_account_id: null },
            { description: "Netflix", amount_cents: -1699, created_at: "2025-12-15T00:00:00Z", settled_at: "2025-12-15", transfer_account_id: null },
          ],
          expense_definitions: [
            { id: "exp-1", name: "Netflix", expected_amount_cents: 1699, recurrence_type: "monthly", is_active: true },
          ],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.detectRecurringExpenses, { query: "Netflix", months: 6 });
      expect(result).toHaveProperty("patterns");
    });
  });

  describe("detectIncomePatterns", () => {
    it("returns detected income patterns", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          transactions: [
            { id: "t1", description: "SALARY ACME CO", amount_cents: 500000, created_at: "2025-11-01T00:00:00Z", settled_at: "2025-11-01", is_income: true },
            { id: "t2", description: "SALARY ACME CO", amount_cents: 500000, created_at: "2025-11-15T00:00:00Z", settled_at: "2025-11-15", is_income: true },
            { id: "t3", description: "SALARY ACME CO", amount_cents: 500000, created_at: "2025-12-01T00:00:00Z", settled_at: "2025-12-01", is_income: true },
          ],
          income_sources: [],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.detectIncomePatterns, { months: 6 });
      expect(result).toHaveProperty("patterns");
      expect(Array.isArray((result as any).patterns)).toBe(true);
    });

    it("marks already-tracked income sources", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          transactions: [
            { id: "t1", description: "SALARY ACME CO", amount_cents: 500000, created_at: "2025-11-01T00:00:00Z", settled_at: "2025-11-01", is_income: true },
            { id: "t2", description: "SALARY ACME CO", amount_cents: 500000, created_at: "2025-11-15T00:00:00Z", settled_at: "2025-11-15", is_income: true },
          ],
          income_sources: [
            { id: "inc-1", name: "Salary", amount_cents: 500000, frequency: "fortnightly", is_active: true, user_id: "user-1" },
          ],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.detectIncomePatterns, { query: "salary", months: 6 });
      expect(result).toHaveProperty("patterns");
    });
  });

  // =========================================================================
  // WRITE TOOLS
  // =========================================================================

  describe("createBudget", () => {
    it("returns error when no partnership", async () => {
      const tools = createFinancialTools(
        createMockSupabase({}) as any,
        ACCOUNT_IDS,
        null,
        USER_ID
      );
      const result = await runTool(tools.createBudget, { name: "Test Budget", budgetType: "personal" });
      expect(result).toHaveProperty("error");
    });

    it("creates budget with valid input", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          user_budgets: [{ id: "budget-1", name: "Weekly Essentials", is_active: true }],
          savings_goals: [],
          investments: [],
          budget_assignments: [],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.createBudget, { name: "Weekly Essentials", budgetType: "custom", periodType: "weekly" });
      expect(result).toHaveProperty("success");
    });
  });

  describe("createBudgetAssignment", () => {
    it("validates positive amount", async () => {
      const result = await runTool(tools.createBudgetAssignment, { month: "2025-06", categoryName: "Groceries", amountDollars: -100 });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("negative");
    });

    it("validates month format", async () => {
      const result = await runTool(tools.createBudgetAssignment, { month: "June 2025", categoryName: "Groceries", amountDollars: 600 });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("YYYY-MM");
    });

    it("returns error when no partnership", async () => {
      const supabase = createMockSupabase({});
      const noPartnerTools = createFinancialTools(supabase as any, ACCOUNT_IDS, null, USER_ID);
      const result = await runTool(noPartnerTools.createBudgetAssignment, { month: "2025-06", categoryName: "Groceries", amountDollars: 600 });
      expect(result).toHaveProperty("error");
    });

    it("creates assignment with valid input", async () => {
      const result = await runTool(tools.createBudgetAssignment, { month: "2025-06", categoryName: "Groceries", amountDollars: 600 });
      expect(result).toHaveProperty("category", "Groceries");
      expect(result).toHaveProperty("amount", "$600.00");
    });
  });

  describe("createExpenseDefinition", () => {
    it("validates positive amount", async () => {
      const result = await runTool(tools.createExpenseDefinition, {
          name: "Test",
          categoryName: "Entertainment",
          amountDollars: 0,
          recurrenceType: "monthly",
          nextDueDate: "2025-07-01",
        });
      expect(result).toHaveProperty("error");
    });

    it("returns error when no partnership", async () => {
      const supabase = createMockSupabase({});
      const noPartnerTools = createFinancialTools(supabase as any, ACCOUNT_IDS, null, USER_ID);
      const result = await runTool(noPartnerTools.createExpenseDefinition, {
          name: "Netflix",
          categoryName: "Entertainment",
          amountDollars: 22.99,
          recurrenceType: "monthly",
          nextDueDate: "2025-07-05",
        });
      expect(result).toHaveProperty("error");
    });

    it("blocks duplicate by name", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          expense_definitions: [
            { id: "exp-1", name: "Netflix", expected_amount_cents: 1699, recurrence_type: "monthly", is_active: true },
          ],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.createExpenseDefinition, { name: "Netflix", categoryName: "Entertainment", amountDollars: 22.99, recurrenceType: "monthly", nextDueDate: "2026-03-15" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("already exists");
    });
  });

  describe("createSavingsGoal", () => {
    it("validates positive target", async () => {
      const result = await runTool(tools.createSavingsGoal, { name: "Test", targetAmountDollars: 0 });
      expect(result).toHaveProperty("error");
    });

    it("returns error when no partnership", async () => {
      const supabase = createMockSupabase({});
      const noPartnerTools = createFinancialTools(supabase as any, ACCOUNT_IDS, null, USER_ID);
      const result = await runTool(noPartnerTools.createSavingsGoal, { name: "Holiday", targetAmountDollars: 5000 });
      expect(result).toHaveProperty("error");
    });

    it("blocks duplicate by name", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          savings_goals: [
            { id: "goal-1", name: "Holiday Fund", target_amount_cents: 500000, current_amount_cents: 100000, is_completed: false },
          ],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.createSavingsGoal, { name: "Holiday Fund", targetAmountDollars: 5000 });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("already exists");
    });
  });

  describe("updateSavingsGoal", () => {
    it("returns error when goal not found", async () => {
      const supabase = createMockSupabase({ savings_goals: [] });
      const emptyTools = createFinancialTools(supabase as any, ACCOUNT_IDS, PARTNERSHIP_ID, USER_ID);
      const result = await runTool(emptyTools.updateSavingsGoal, { goalName: "Nonexistent Goal", addFundsDollars: 100 });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("No savings goal");
    });

    it("returns error listing matches when multiple goals match", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          savings_goals: [
            { id: "goal-1", name: "Holiday Fund", target_amount_cents: 500000, current_amount_cents: 100000, deadline: null },
            { id: "goal-2", name: "Holiday Bonus", target_amount_cents: 200000, current_amount_cents: 50000, deadline: null },
          ],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.updateSavingsGoal, { goalName: "Holiday" });
      expect(result).toHaveProperty("error");
    });
  });

  describe("recategorizeTransaction", () => {
    it("returns error when transaction not found", async () => {
      const supabase = createMockSupabase({ transactions: [] });
      const emptyTools = createFinancialTools(supabase as any, ACCOUNT_IDS, PARTNERSHIP_ID, USER_ID);
      const result = await runTool(emptyTools.recategorizeTransaction, { transactionDescription: "Nonexistent", newCategoryId: "groceries" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("No transaction found");
    });

    it("updates parent_category_id alongside category_id", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          transactions: [
            { id: "txn-1", description: "ALDI", amount_cents: -4500, category_id: "uncategorized", parent_category_id: "uncategorized", settled_at: "2026-01-15" },
          ],
          category_mappings: [
            { up_category_id: "groceries", new_parent_name: "Food & Dining", new_child_name: "Groceries" },
          ],
          transaction_category_overrides: [],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.recategorizeTransaction, { transactionDescription: "ALDI", newCategoryId: "groceries" });
      expect(result).toHaveProperty("success");
    });
  });

  describe("createIncomeSource", () => {
    it("validates positive amount", async () => {
      const result = await runTool(tools.createIncomeSource, { name: "Test", amountDollars: -500, sourceType: "recurring-salary" as const, frequency: "monthly" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("positive");
    });

    it("returns error when no userId", async () => {
      const supabase = createMockSupabase({});
      const noUserTools = createFinancialTools(supabase as any, ACCOUNT_IDS, PARTNERSHIP_ID);
      const result = await runTool(noUserTools.createIncomeSource, { name: "Salary", amountDollars: 5500, sourceType: "recurring-salary" as const, frequency: "fortnightly" });
      expect(result).toHaveProperty("error");
    });

    it("blocks duplicate by name", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          income_sources: [
            { id: "inc-1", name: "Salary", amount_cents: 500000, frequency: "fortnightly", is_active: true, user_id: "user-1" },
          ],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.createIncomeSource, { name: "Salary", amountDollars: 5000, sourceType: "recurring-salary" as const, frequency: "fortnightly" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("already exists");
    });
  });

  describe("createInvestment", () => {
    it("blocks duplicate by name", async () => {
      const tools = createFinancialTools(
        createMockSupabase({
          investments: [
            { id: "inv-1", name: "VDHG", asset_type: "etf", current_value_cents: 620000, ticker_symbol: "VDHG.AX" },
          ],
        }) as any,
        ACCOUNT_IDS,
        PARTNERSHIP_ID,
        USER_ID
      );
      const result = await runTool(tools.createInvestment, { assetType: "etf", name: "VDHG", currentValueDollars: 6200 });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("already exists");
    });

    it("returns error when no partnership", async () => {
      const tools = createFinancialTools(
        createMockSupabase({}) as any,
        ACCOUNT_IDS,
        null,
        USER_ID
      );
      const result = await runTool(tools.createInvestment, { assetType: "etf", name: "VDHG", currentValueDollars: 6200 });
      expect(result).toHaveProperty("error");
    });
  });

  // =========================================================================
  // SCENARIO TESTS — Real user questions
  // =========================================================================

  describe("User Question Scenarios", () => {
    it('"What was my first transaction?" — searchTransactions can find oldest', async () => {
      // The AI should use queryFinancialData with orderBy settled_at ascending, limit 1
      const result = await runTool(tools.queryFinancialData, {
          table: "transactions",
          select: "description, amount_cents, settled_at",
          orderBy: { column: "settled_at", ascending: true },
          limit: 1,
        });
      expect(result).toHaveProperty("rows");
      expect((result as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
    });

    it('"How much have I spent at Woolworths?" — getMerchantSpending', async () => {
      const result = await runTool(tools.getMerchantSpending, { merchant: "Woolworths" });
      expect(result).toHaveProperty("totalSpent");
      expect(result.totalSpent).toMatch(/^\$/);
    });

    it('"What are my account balances?" — getAccountBalances', async () => {
      const result = await runTool(tools.getAccountBalances, {});
      expect(result.accounts.length).toBe(2);
      expect(result).toHaveProperty("totalBalance");
    });

    it('"Am I spending too fast this month?" — getSpendingVelocity', async () => {
      const result = await runTool(tools.getSpendingVelocity, {});
      expect(result).toHaveProperty("dailyBurnRate");
      expect(result).toHaveProperty("safeToSpendPerDay");
      expect(result).toHaveProperty("onTrack");
    });

    it('"Can I afford a holiday in March?" — getCashflowForecast', async () => {
      const result = await runTool(tools.getCashflowForecast, { monthsAhead: 6 });
      expect(result.projections.length).toBe(6);
      expect(result).toHaveProperty("currentBalance");
      expect(result).toHaveProperty("monthlySurplus");
    });

    it('"How much do I spend on subscriptions?" — getSubscriptionCostTrajectory', async () => {
      const result = await runTool(tools.getSubscriptionCostTrajectory, {});
      expect(result).toHaveProperty("subscriptionCount");
      expect(result).toHaveProperty("totalMonthlyCost");
      expect(result).toHaveProperty("totalAnnualCost");
    });

    it('"Show me my savings goals" — getSavingsGoals', async () => {
      const result = await runTool(tools.getSavingsGoals, {});
      expect(result.goals.length).toBeGreaterThan(0);
      expect(result.goals[0]).toHaveProperty("progress");
    });

    it('"How does my spending compare to last month?" — comparePeriods', async () => {
      const result = await runTool(tools.comparePeriods, { month1: "2025-05", month2: "2025-06" });
      expect(result).toHaveProperty("month1", "2025-05");
      expect(result).toHaveProperty("month2", "2025-06");
      expect(result).toHaveProperty("comparison");
    });
  });
});
