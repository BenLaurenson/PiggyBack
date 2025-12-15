import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLikePattern, safeErrorMessage } from "@/lib/safe-error";
import { advancePayDate } from "@/lib/advance-pay-date";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";
import { classifySpending } from "@/lib/fire-spending-classifier";
import { generateHealthMetrics, generatePriorityRecommendations } from "@/lib/plan-health-calculations";
import type { HealthMetricInputs, RecommendationInputs, GoalSummary } from "@/lib/plan-health-calculations";
import { classifyGoalStatus } from "@/lib/goal-calculations";
import type { GoalForCalculation, GoalContribution } from "@/lib/goal-calculations";
import { calculatePerformanceMetrics, calculateTopMovers, calculateRebalancing, aggregatePortfolioHistory } from "@/lib/portfolio-aggregation";
import {
  getBudgetPeriodRange,
  calculateBudgetSummary,
  getMonthKeyForPeriod,
  type BudgetSummaryInput,
  type IncomeSourceInput,
  type AssignmentInput,
  type TransactionInput,
  type ExpenseDefInput,
  type SplitSettingInput,
  type CategoryMapping,
  type PeriodType,
  type BudgetView,
} from "@/lib/budget-engine";
import {
  projectFireDate,
  calculateAge,
  generateRecommendations,
  calculateSavingsImpact,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
} from "@/lib/fire-calculations";
import { generateFireGameplan } from "@/lib/fire-gameplan";
import { detectRecurringTransactions } from "@/lib/recurring-detector";
import { analyzeIncomePattern } from "@/lib/income-pattern-analysis";
import { insertBudgetWithSlugRetry } from "@/lib/slugify";
import {
  ALL_PARENT_CATEGORIES,
  getSubcategoriesForParents,
} from "@/lib/budget-templates";

const EMOJI_KEYWORDS: [string[], string][] = [
  [["rent", "real estate", "mortgage", "housing", "apartment"], "🏠"],
  [["gym", "fitness", "sport", "minres"], "🏋️"],
  [["crossfit", "wolves", "workout", "training"], "💪"],
  [["internet", "nbn", "belong", "broadband", "wifi"], "📡"],
  [["phone", "mobile", "telstra", "optus", "vodafone"], "📱"],
  [["electricity", "power", "energy", "synergy", "gas", "water", "utilities"], "⚡"],
  [["insurance", "rac", "nrma", "allianz", "cover"], "🛡️"],
  [["transport", "rego", "registration", "license"], "🚗"],
  [["netflix", "disney", "stan", "streaming", "spotify", "youtube", "binge"], "🎬"],
  [["ai", "perplexity", "chatgpt", "openai", "claude", "copilot"], "🤖"],
  [["vpn", "torbox", "privacy", "security", "nord"], "🔒"],
  [["email", "proton", "mail", "fastmail"], "📧"],
  [["domain", "porkbun", "cloudflare", "hosting", "server"], "🌐"],
  [["music", "apple music"], "🎵"],
  [["storage", "icloud", "dropbox", "google one", "onedrive"], "☁️"],
  [["grocery", "woolworths", "coles", "aldi", "iga"], "🛒"],
  [["health", "medical", "doctor", "dental", "pharmacy"], "🏥"],
  [["child", "school", "daycare", "education", "tuition"], "📚"],
  [["pet", "vet", "animal"], "🐾"],
  [["subscription", "membership"], "📦"],
];

function inferExpenseEmoji(name: string, categoryName?: string): string {
  const searchText = `${name} ${categoryName || ""}`.toLowerCase();
  for (const [keywords, emoji] of EMOJI_KEYWORDS) {
    if (keywords.some((kw) => searchText.includes(kw))) return emoji;
  }
  return "📋";
}

/** Shared mutable counter to cap write operations per AI chat request (H5/M191). */
export type WriteCounter = { count: number; limit: number };

function checkWriteLimit(counter: WriteCounter): string | null {
  if (counter.count >= counter.limit) {
    return `Write operation limit reached (${counter.limit} per request). Please start a new message to make additional changes.`;
  }
  counter.count++;
  return null;
}

/** Shared mutable counter to cap total DB queries per AI chat request (M469). */
export type QueryCounter = { count: number; limit: number };

/** Error thrown when the per-request query limit is exceeded. */
export class QueryLimitError extends Error {
  constructor(limit: number) {
    super(`Query limit reached (${limit} per request). Please summarize with available data.`);
    this.name = "QueryLimitError";
  }
}

/**
 * Wraps a Supabase client with a Proxy that counts every `.from()` and `.rpc()` call.
 * When the query counter limit is reached, throws QueryLimitError so the calling
 * tool can return a graceful message to the AI model.
 */
function createCountedSupabase(
  supabase: SupabaseClient,
  counter: QueryCounter
): SupabaseClient {
  return new Proxy(supabase, {
    get(target, prop, receiver) {
      if (prop === "from" || prop === "rpc") {
        return (...args: unknown[]) => {
          if (counter.count >= counter.limit) {
            throw new QueryLimitError(counter.limit);
          }
          counter.count++;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (target as any)[prop](...args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Creates AI tools that have access to the user's financial data.
 * Each tool queries Supabase with the user's auth context (RLS enforced).
 *
 * @param writeCounter - Shared counter that caps total write operations per request.
 * @param queryCounter - Shared counter that caps total DB queries per request (M469).
 */
export function createFinancialTools(
  rawSupabase: SupabaseClient,
  accountIds: string[],
  partnershipId: string | null,
  userId?: string,
  writeCounter: WriteCounter = { count: 0, limit: 3 },
  queryCounter: QueryCounter = { count: 0, limit: 50 }
) {
  // Wrap the Supabase client to count every query against the per-request limit
  const supabase = createCountedSupabase(rawSupabase, queryCounter);

  const tools = {
    searchTransactions: tool({
      description:
        "Search and filter the user's transactions. Use this to find specific purchases, payments, or transfers. Returns up to 50 results sorted by date (newest first). Always use this when the user asks about specific spending, merchants, or transaction history.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Search text to match against transaction descriptions (merchant names, payees, etc.)"),
        category: z
          .string()
          .optional()
          .describe("Filter by category name (e.g. 'groceries', 'restaurants-and-cafes', 'fuel')"),
        dateFrom: z
          .string()
          .optional()
          .describe("Start date in YYYY-MM-DD format"),
        dateTo: z
          .string()
          .optional()
          .describe("End date in YYYY-MM-DD format"),
        minAmount: z
          .number()
          .finite()
          .optional()
          .describe("Minimum absolute amount in dollars (e.g. 50 for $50+)"),
        maxAmount: z
          .number()
          .finite()
          .optional()
          .describe("Maximum absolute amount in dollars"),
        type: z
          .enum(["spending", "income", "all"])
          .optional()
          .describe("Filter by transaction direction. Default: all"),
        limit: z
          .number()
          .optional()
          .describe("Max results to return (default 25, max 50)"),
      }),
      inputExamples: [
        { input: { query: "Woolworths", type: "spending" } },
        { input: { query: "Netflix", dateFrom: "2025-01-01" } },
        { input: { minAmount: 100, type: "spending", limit: 10 } },
        { input: { category: "groceries", dateFrom: "2025-01-01", dateTo: "2025-01-31" } },
      ],
      execute: async ({
        query,
        category,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        type,
        limit = 25,
      }) => {
        let q = supabase
          .from("transactions")
          .select("description, amount_cents, category_id, parent_category_id, settled_at, created_at, transaction_type, is_income")
          .in("account_id", accountIds)
          .order("settled_at", { ascending: false })
          .limit(Math.min(limit, 50));

        if (query) q = q.ilike("description", `%${escapeLikePattern(query)}%`);
        if (category) q = q.eq("category_id", category);
        if (dateFrom) q = q.gte("settled_at", dateFrom);
        if (dateTo) q = q.lte("settled_at", `${dateTo}T23:59:59`);
        if (type === "spending") q = q.lt("amount_cents", 0);
        if (type === "income") q = q.gt("amount_cents", 0);
        if (minAmount) {
          const minCents = Math.round(Math.abs(Number(minAmount)) * 100);
          q = q.or(`amount_cents.lte.${-minCents},amount_cents.gte.${minCents}`);
        }
        if (maxAmount) {
          const maxCents = Math.round(Math.abs(Number(maxAmount)) * 100);
          q = q.or(`amount_cents.gte.${-maxCents},amount_cents.lte.${maxCents}`);
        }

        const { data, error } = await q;
        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        return {
          count: data?.length || 0,
          transactions: (data || []).map((t: Record<string, unknown>) => ({
            description: t.description,
            amount: `$${(Math.abs(t.amount_cents as number) / 100).toFixed(2)}`,
            amountCents: t.amount_cents,
            isSpending: (t.amount_cents as number) < 0,
            category: t.category_id,
            parentCategory: t.parent_category_id,
            date: t.settled_at || t.created_at,
            type: t.transaction_type,
          })),
        };
      },
    }),

    getSpendingSummary: tool({
      description:
        "Get a summary of spending broken down by category for a given month. Set includeSubcategories to true when the user wants detailed per-subcategory breakdown (e.g. Groceries, Restaurants within Food & Dining).",
      inputSchema: z.object({
        month: z
          .string()
          .describe("Month in YYYY-MM format (e.g. '2025-01' for January 2025)"),
        includeSubcategories: z
          .boolean()
          .optional()
          .describe("Include subcategory breakdown within each parent category (default: false)"),
      }),
      inputExamples: [
        { input: { month: "2025-01" } },
        { input: { month: "2025-01", includeSubcategories: true } },
      ],
      execute: async ({ month, includeSubcategories = false }) => {
        const startDate = `${month}-01`;
        const endDate = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0);
        const endDateStr = `${month}-${endDate.getDate().toString().padStart(2, "0")}T23:59:59`;

        const { data: transactions } = await supabase
          .from("transactions")
          .select("amount_cents, category_id, parent_category_id")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null)
          .gte("settled_at", startDate)
          .lte("settled_at", endDateStr);

        const { data: mappings } = await supabase
          .from("category_mappings")
          .select("up_category_id, new_parent_name, new_child_name");

        const parentMap = new Map<string, string>();
        const childMap = new Map<string, string>();
        (mappings as Array<{ up_category_id: string; new_parent_name: string; new_child_name: string }> || []).forEach(
          (m) => {
            parentMap.set(m.up_category_id, m.new_parent_name);
            childMap.set(m.up_category_id, m.new_child_name);
          }
        );

        const spending = new Map<string, number>();
        const subSpending = new Map<string, Map<string, number>>();
        let total = 0;

        (transactions as Array<{ amount_cents: number; category_id: string | null }> || []).forEach((t) => {
          const parentName = t.category_id ? (parentMap.get(t.category_id) || t.category_id) : "Uncategorized";
          const amount = Math.abs(t.amount_cents);
          spending.set(parentName, (spending.get(parentName) || 0) + amount);
          total += amount;

          if (includeSubcategories && t.category_id) {
            const childName = childMap.get(t.category_id) || "Other";
            if (!subSpending.has(parentName)) subSpending.set(parentName, new Map());
            const parentSubs = subSpending.get(parentName)!;
            parentSubs.set(childName, (parentSubs.get(childName) || 0) + amount);
          }
        });

        const categories = [...spending.entries()]
          .map(([name, cents]) => {
            const cat: Record<string, unknown> = {
              category: name,
              amount: `$${(cents / 100).toFixed(2)}`,
              amountCents: cents,
              percentage: total > 0 ? `${((cents / total) * 100).toFixed(1)}%` : "0%",
            };

            if (includeSubcategories) {
              const subs = subSpending.get(name);
              if (subs && subs.size > 0) {
                cat.subcategories = [...subs.entries()]
                  .map(([subName, subCents]) => ({
                    name: subName,
                    amount: `$${(subCents / 100).toFixed(2)}`,
                    amountCents: subCents,
                    percentage: cents > 0 ? `${((subCents / cents) * 100).toFixed(1)}%` : "0%",
                  }))
                  .sort((a, b) => b.amountCents - a.amountCents);
              }
            }

            return cat;
          })
          .sort((a, b) => (b.amountCents as number) - (a.amountCents as number));

        return {
          month,
          totalSpending: `$${(total / 100).toFixed(2)}`,
          totalSpendingCents: total,
          transactionCount: (transactions as unknown[] || []).length,
          categories,
        };
      },
    }),

    getIncomeSummary: tool({
      description:
        "Get income breakdown for a given month. Shows salary, deposits, and other income sources.",
      inputSchema: z.object({
        month: z
          .string()
          .describe("Month in YYYY-MM format"),
      }),
      inputExamples: [
        { input: { month: "2025-01" } },
      ],
      execute: async ({ month }) => {
        const startDate = `${month}-01`;
        const endDate = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0);
        const endDateStr = `${month}-${endDate.getDate().toString().padStart(2, "0")}T23:59:59`;

        const { data: transactions } = await supabase
          .from("transactions")
          .select("description, amount_cents, transaction_type, category_id, settled_at")
          .in("account_id", accountIds)
          .gt("amount_cents", 0)
          .is("transfer_account_id", null)
          .not("category_id", "in", "(internal-transfer,round-up,external-transfer)")
          .gte("settled_at", startDate)
          .lte("settled_at", endDateStr)
          .order("amount_cents", { ascending: false });

        let total = 0;
        const sources = new Map<string, { total: number; count: number }>();

        (transactions as Array<Record<string, unknown>> || []).forEach((t) => {
          const source = (t.transaction_type || t.category_id || "Other") as string;
          const amountCents = t.amount_cents as number;
          const existing = sources.get(source) || { total: 0, count: 0 };
          existing.total += amountCents;
          existing.count += 1;
          sources.set(source, existing);
          total += amountCents;
        });

        return {
          month,
          totalIncome: `$${(total / 100).toFixed(2)}`,
          totalIncomeCents: total,
          sources: [...sources.entries()]
            .map(([name, data]) => ({
              source: name,
              amount: `$${(data.total / 100).toFixed(2)}`,
              count: data.count,
            }))
            .sort((a, b) => b.count - a.count),
          topTransactions: (transactions as Array<Record<string, unknown>> || []).slice(0, 10).map((t) => ({
            description: t.description as string,
            amount: `$${((t.amount_cents as number) / 100).toFixed(2)}`,
            date: t.settled_at as string,
            type: t.transaction_type as string,
          })),
        };
      },
    }),

    getAccountBalances: tool({
      description:
        "Get current balances for all the user's bank accounts. Shows each account name, type (TRANSACTIONAL/SAVER), and balance.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: accounts } = await supabase
          .from("accounts")
          .select("display_name, account_type, balance_cents, is_active, updated_at")
          .in("id", accountIds)
          .order("balance_cents", { ascending: false });

        const rows = accounts as Array<Record<string, unknown>> || [];
        const total = rows.reduce((sum, a) => sum + (a.balance_cents as number), 0);

        return {
          totalBalance: `$${(total / 100).toFixed(2)}`,
          totalBalanceCents: total,
          accounts: rows.map((a) => ({
            name: a.display_name,
            type: a.account_type,
            balance: `$${((a.balance_cents as number) / 100).toFixed(2)}`,
            isActive: a.is_active,
            lastUpdated: a.updated_at,
          })),
        };
      },
    }),

    getUpcomingBills: tool({
      description:
        "Get upcoming bills and recurring expenses. Shows bill names, amounts, due dates, and whether they've been paid this period.",
      inputSchema: z.object({
        includeInactive: z
          .boolean()
          .optional()
          .describe("Include inactive/paused bills (default: false)"),
      }),
      inputExamples: [
        { input: {} },
        { input: { includeInactive: true } },
      ],
      execute: async ({ includeInactive = false }) => {
        if (!partnershipId) return { error: "No partnership configured", bills: [] };

        let q = supabase
          .from("expense_definitions")
          .select("id, name, category_name, expected_amount_cents, recurrence_type, next_due_date, emoji, is_active, match_pattern, merchant_name")
          .eq("partnership_id", partnershipId)
          .order("next_due_date", { ascending: true });

        if (!includeInactive) q = q.eq("is_active", true);

        const { data: bills } = await q;
        const billRows = bills as Array<Record<string, unknown>> || [];

        const { data: matches } = await supabase
          .from("expense_matches")
          .select("expense_definition_id, matched_at")
          .in("expense_definition_id", billRows.map((b) => b.id as string));

        const matchMap = new Map<string, string>();
        (matches as Array<Record<string, unknown>> || []).forEach((m) => {
          const defId = m.expense_definition_id as string;
          const matchedAt = m.matched_at as string;
          const existing = matchMap.get(defId);
          if (!existing || matchedAt > existing) {
            matchMap.set(defId, matchedAt);
          }
        });

        const totalMonthly = billRows
          .filter((b) => b.is_active)
          .reduce((sum, b) => {
            const amount = b.expected_amount_cents as number;
            switch (b.recurrence_type) {
              case "weekly": return sum + amount * 52 / 12;
              case "fortnightly": return sum + amount * 26 / 12;
              case "monthly": return sum + amount;
              case "quarterly": return sum + amount / 3;
              case "yearly": return sum + amount / 12;
              default: return sum + amount;
            }
          }, 0);

        return {
          totalMonthlyEstimate: `$${(totalMonthly / 100).toFixed(2)}`,
          billCount: billRows.length,
          bills: billRows.map((b) => ({
            name: b.name,
            emoji: b.emoji,
            category: b.category_name,
            amount: `$${((b.expected_amount_cents as number) / 100).toFixed(2)}`,
            recurrence: b.recurrence_type,
            nextDue: b.next_due_date,
            isActive: b.is_active,
            lastPaid: matchMap.get(b.id as string) || null,
            merchant: b.merchant_name,
          })),
        };
      },
    }),

    getSavingsGoals: tool({
      description:
        "Get savings goals and their progress. Shows target amounts, current savings, and deadlines.",
      inputSchema: z.object({
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Include completed goals (default: false)"),
      }),
      inputExamples: [
        { input: {} },
        { input: { includeCompleted: true } },
      ],
      execute: async ({ includeCompleted = false }) => {
        if (!partnershipId) return { error: "No partnership configured", goals: [] };

        let q = supabase
          .from("savings_goals")
          .select("name, target_amount_cents, current_amount_cents, deadline, icon, color, is_completed, completed_at")
          .eq("partnership_id", partnershipId)
          .order("created_at", { ascending: false });

        if (!includeCompleted) q = q.eq("is_completed", false);

        const { data: goals } = await q;

        return {
          goals: (goals as Array<Record<string, unknown>> || []).map((g) => ({
            name: g.name,
            target: `$${((g.target_amount_cents as number) / 100).toFixed(2)}`,
            current: `$${((g.current_amount_cents as number) / 100).toFixed(2)}`,
            remaining: `$${(((g.target_amount_cents as number) - (g.current_amount_cents as number)) / 100).toFixed(2)}`,
            progress: `${(((g.current_amount_cents as number) / (g.target_amount_cents as number)) * 100).toFixed(1)}%`,
            deadline: g.deadline,
            isCompleted: g.is_completed,
            completedAt: g.completed_at,
            icon: g.icon,
          })),
        };
      },
    }),

    getMonthlyTrends: tool({
      description:
        "Get spending and income trends over multiple months. Great for spotting patterns, comparing months, and understanding long-term financial trajectory.",
      inputSchema: z.object({
        months: z
          .number()
          .optional()
          .describe("Number of months to look back (default: 6, max: 24)"),
      }),
      inputExamples: [
        { input: { months: 6 } },
        { input: { months: 12 } },
      ],
      execute: async ({ months = 6 }) => {
        const lookback = Math.min(months, 24);
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - lookback);
        startDate.setDate(1);

        const { data: transactions } = await supabase
          .from("transactions")
          .select("amount_cents, settled_at, transfer_account_id, category_id")
          .in("account_id", accountIds)
          .is("transfer_account_id", null)
          .not("category_id", "in", "(internal-transfer,round-up,external-transfer)")
          .gte("settled_at", startDate.toISOString())
          .order("settled_at", { ascending: true });

        const monthlyData = new Map<string, { spending: number; income: number; count: number }>();

        (transactions as Array<Record<string, unknown>> || []).forEach((t) => {
          if (!t.settled_at) return;
          const month = (t.settled_at as string).substring(0, 7);
          const existing = monthlyData.get(month) || { spending: 0, income: 0, count: 0 };
          const amountCents = t.amount_cents as number;

          if (amountCents < 0) {
            existing.spending += Math.abs(amountCents);
          } else {
            existing.income += amountCents;
          }
          existing.count += 1;
          monthlyData.set(month, existing);
        });

        const trends = [...monthlyData.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({
            month,
            spending: `$${(data.spending / 100).toFixed(2)}`,
            income: `$${(data.income / 100).toFixed(2)}`,
            net: `$${((data.income - data.spending) / 100).toFixed(2)}`,
            savingsRate: data.income > 0 ? `${(((data.income - data.spending) / data.income) * 100).toFixed(1)}%` : "N/A",
            transactionCount: data.count,
          }));

        const avgSpending = trends.length > 0
          ? trends.reduce((sum, t) => sum + parseFloat(t.spending.replace("$", "")), 0) / trends.length
          : 0;
        const avgIncome = trends.length > 0
          ? trends.reduce((sum, t) => sum + parseFloat(t.income.replace("$", "")), 0) / trends.length
          : 0;

        return {
          periodMonths: lookback,
          averageMonthlySpending: `$${avgSpending.toFixed(2)}`,
          averageMonthlyIncome: `$${avgIncome.toFixed(2)}`,
          averageMonthlySavings: `$${(avgIncome - avgSpending).toFixed(2)}`,
          trends,
        };
      },
    }),

    getMerchantSpending: tool({
      description:
        "Get spending history at a specific merchant or store. Shows total spent, visit count, average transaction, and recent transactions.",
      inputSchema: z.object({
        merchant: z
          .string()
          .describe("Merchant name to search for (partial match, e.g. 'Woolworths', 'Netflix')"),
        months: z
          .number()
          .optional()
          .describe("Number of months to look back (default: 12)"),
      }),
      inputExamples: [
        { input: { merchant: "Woolworths" } },
        { input: { merchant: "Uber Eats", months: 6 } },
      ],
      execute: async ({ merchant, months = 12 }) => {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const { data: transactions } = await supabase
          .from("transactions")
          .select("description, amount_cents, settled_at, category_id")
          .in("account_id", accountIds)
          .ilike("description", `%${escapeLikePattern(merchant)}%`)
          .gte("settled_at", startDate.toISOString())
          .order("settled_at", { ascending: false });

        const rows = transactions as Array<Record<string, unknown>> || [];
        const spending = rows.filter((t) => (t.amount_cents as number) < 0);
        const totalSpent = spending.reduce((sum, t) => sum + Math.abs(t.amount_cents as number), 0);

        const byMonth = new Map<string, number>();
        spending.forEach((t) => {
          if (!t.settled_at) return;
          const month = (t.settled_at as string).substring(0, 7);
          byMonth.set(month, (byMonth.get(month) || 0) + Math.abs(t.amount_cents as number));
        });

        return {
          merchant,
          totalTransactions: rows.length,
          totalSpent: `$${(totalSpent / 100).toFixed(2)}`,
          averageTransaction: spending.length > 0 ? `$${(totalSpent / spending.length / 100).toFixed(2)}` : "$0.00",
          visitCount: spending.length,
          recentTransactions: rows.slice(0, 10).map((t) => ({
            description: t.description,
            amount: `$${(Math.abs(t.amount_cents as number) / 100).toFixed(2)}`,
            isSpending: (t.amount_cents as number) < 0,
            date: t.settled_at,
          })),
          monthlyBreakdown: [...byMonth.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([month, cents]) => ({
              month,
              amount: `$${(cents / 100).toFixed(2)}`,
            })),
        };
      },
    }),

    comparePeriods: tool({
      description:
        "Compare spending between two months side by side. Shows differences by category, highlighting where spending increased or decreased.",
      inputSchema: z.object({
        month1: z.string().describe("First month in YYYY-MM format"),
        month2: z.string().describe("Second month in YYYY-MM format"),
      }),
      inputExamples: [
        { input: { month1: "2025-01", month2: "2024-12" } },
      ],
      execute: async ({ month1, month2 }) => {
        async function getMonthSpending(month: string) {
          const startDate = `${month}-01`;
          const endDate = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0);
          const endDateStr = `${month}-${endDate.getDate().toString().padStart(2, "0")}T23:59:59`;

          const { data } = await supabase
            .from("transactions")
            .select("amount_cents, category_id")
            .in("account_id", accountIds)
            .lt("amount_cents", 0)
            .is("transfer_account_id", null)
            .gte("settled_at", startDate)
            .lte("settled_at", endDateStr);

          const { data: mappings } = await supabase
            .from("category_mappings")
            .select("up_category_id, new_parent_name");

          const categoryMap = new Map<string, string>();
          (mappings as Array<{ up_category_id: string; new_parent_name: string }> || []).forEach(
            (m) => categoryMap.set(m.up_category_id, m.new_parent_name)
          );

          const spending = new Map<string, number>();
          let total = 0;

          (data as Array<{ amount_cents: number; category_id: string | null }> || []).forEach((t) => {
            const catName = t.category_id ? (categoryMap.get(t.category_id) || t.category_id) : "Uncategorized";
            const amount = Math.abs(t.amount_cents);
            spending.set(catName, (spending.get(catName) || 0) + amount);
            total += amount;
          });

          return { spending, total };
        }

        const [period1, period2] = await Promise.all([
          getMonthSpending(month1),
          getMonthSpending(month2),
        ]);

        const allCategories = new Set([
          ...period1.spending.keys(),
          ...period2.spending.keys(),
        ]);

        const comparison = [...allCategories]
          .map((cat) => {
            const amount1 = period1.spending.get(cat) || 0;
            const amount2 = period2.spending.get(cat) || 0;
            const diff = amount2 - amount1;
            return {
              category: cat,
              month1Amount: `$${(amount1 / 100).toFixed(2)}`,
              month2Amount: `$${(amount2 / 100).toFixed(2)}`,
              difference: `${diff >= 0 ? "+" : ""}$${(diff / 100).toFixed(2)}`,
              percentChange: amount1 > 0 ? `${((diff / amount1) * 100).toFixed(1)}%` : "N/A",
            };
          })
          .sort((a, b) => {
            const diffA = Math.abs(parseFloat(a.difference.replace(/[+$]/g, "")));
            const diffB = Math.abs(parseFloat(b.difference.replace(/[+$]/g, "")));
            return diffB - diffA;
          });

        return {
          month1,
          month2,
          month1Total: `$${(period1.total / 100).toFixed(2)}`,
          month2Total: `$${(period2.total / 100).toFixed(2)}`,
          totalDifference: `${period2.total - period1.total >= 0 ? "+" : ""}$${((period2.total - period1.total) / 100).toFixed(2)}`,
          comparison,
        };
      },
    }),

    getTopMerchants: tool({
      description:
        "Get the top merchants/payees by total spending for a given period. Useful for finding where most money goes.",
      inputSchema: z.object({
        month: z.string().optional().describe("Month in YYYY-MM format (omit for all time)"),
        limit: z.number().optional().describe("Number of merchants to return (default: 15)"),
      }),
      inputExamples: [
        { input: { month: "2025-01", limit: 10 } },
        { input: { limit: 20 } },
      ],
      execute: async ({ month, limit = 15 }) => {
        let q = supabase
          .from("transactions")
          .select("description, amount_cents, settled_at")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null);

        if (month) {
          const startDate = `${month}-01`;
          const endDate = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0);
          q = q.gte("settled_at", startDate).lte("settled_at", `${month}-${endDate.getDate().toString().padStart(2, "0")}T23:59:59`);
        }

        const { data: transactions } = await q;

        const merchants = new Map<string, { total: number; count: number }>();
        (transactions as Array<Record<string, unknown>> || []).forEach((t) => {
          const desc = t.description as string;
          const existing = merchants.get(desc) || { total: 0, count: 0 };
          existing.total += Math.abs(t.amount_cents as number);
          existing.count += 1;
          merchants.set(desc, existing);
        });

        const sorted = [...merchants.entries()]
          .sort(([, a], [, b]) => b.total - a.total)
          .slice(0, limit)
          .map(([name, data], i) => ({
            rank: i + 1,
            merchant: name,
            totalSpent: `$${(data.total / 100).toFixed(2)}`,
            visits: data.count,
            averageSpend: `$${(data.total / data.count / 100).toFixed(2)}`,
          }));

        return {
          period: month || "all time",
          merchants: sorted,
        };
      },
    }),

    getBudgetStatus: tool({
      description:
        "Get budget vs actual spending for a given period. Uses the budget engine for accurate calculations including expense-default fills, split-aware spending, and support for weekly/fortnightly/monthly period types. Shows each budgeted row with name, budgeted amount, actual spending, and remaining. Supports multi-budget and individual/shared views.",
      inputSchema: z.object({
        month: z
          .string()
          .optional()
          .describe("Month in YYYY-MM format (defaults to current month). Used as the period anchor date."),
        periodType: z
          .enum(["weekly", "fortnightly", "monthly"])
          .optional()
          .describe("Period type override (default: auto-detected from budget settings)"),
        budgetView: z
          .enum(["individual", "shared"])
          .optional()
          .describe("Which budget view (default: from user's default budget, typically 'shared')"),
        budgetId: z
          .string()
          .optional()
          .describe("Specific budget ID for multi-budget users (default: user's default budget)"),
      }),
      inputExamples: [
        { input: {} },
        { input: { month: "2025-02" } },
        { input: { month: "2025-02", budgetView: "individual" } },
      ],
      execute: async ({ month, periodType, budgetView, budgetId }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        // Look up default budget if not specified
        let budgetPeriodType: PeriodType = (periodType as PeriodType) || "monthly";
        let budgetMethodology = "custom";
        let totalBudget: number | null = null;
        let ownerUserId = userId || "";

        if (!budgetId) {
          const { data: defaultBudget } = await supabase
            .from("user_budgets")
            .select("id, budget_view, period_type, methodology, total_budget, created_by")
            .eq("partnership_id", partnershipId)
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle();
          if (defaultBudget) {
            budgetId = defaultBudget.id;
            budgetView = budgetView || defaultBudget.budget_view;
            if (!periodType) budgetPeriodType = defaultBudget.period_type as PeriodType;
            budgetMethodology = defaultBudget.methodology || "custom";
            totalBudget = defaultBudget.total_budget;
            ownerUserId = defaultBudget.created_by ?? userId ?? "";
          }
        } else {
          const { data: budget } = await supabase
            .from("user_budgets")
            .select("budget_view, period_type, methodology, total_budget, created_by")
            .eq("id", budgetId)
            .single();
          if (budget) {
            budgetView = budgetView || budget.budget_view;
            if (!periodType) budgetPeriodType = budget.period_type as PeriodType;
            budgetMethodology = budget.methodology || "custom";
            totalBudget = budget.total_budget;
            ownerUserId = budget.created_by ?? userId ?? "";
          }
        }
        budgetView = budgetView || "shared";

        // Compute period range from month param (or current date)
        const anchorDate = month ? new Date(`${month}-15`) : new Date();
        const periodRange = getBudgetPeriodRange(anchorDate, budgetPeriodType);
        const monthKey = getMonthKeyForPeriod(anchorDate);

        // Get effective account IDs for the budget view
        const effectiveIds = userId
          ? await getEffectiveAccountIds(supabase, partnershipId, userId, budgetView as BudgetView)
          : accountIds;

        // Run 6 parallel queries — same pattern as budget page
        const [
          { data: rawIncome },
          { data: rawAssignments },
          { data: rawTransactions },
          { data: rawExpenseDefs },
          { data: rawSplits },
          { data: rawMappings },
        ] = await Promise.all([
          supabase
            .from("income_sources")
            .select("amount_cents, frequency, source_type, is_received, received_date, user_id, is_manual_partner_income")
            .eq("partnership_id", partnershipId)
            .eq("is_active", true),
          supabase
            .from("budget_assignments")
            .select("category_name, subcategory_name, assigned_cents, assignment_type, goal_id, asset_id")
            .eq("budget_id", budgetId!)
            .eq("month", monthKey)
            .eq("budget_view", budgetView),
          effectiveIds.length > 0
            ? supabase
                .from("transactions")
                .select("id, amount_cents, category_id, settled_at, expense_matches(expense_definition_id)")
                .in("account_id", effectiveIds)
                .gte("settled_at", periodRange.start.toISOString())
                .lte("settled_at", periodRange.end.toISOString())
                .lt("amount_cents", 0)
                .eq("is_internal_transfer", false)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("expense_definitions")
            .select("id, name, emoji, category_name, expected_amount_cents, next_due_date, recurrence_type, expense_matches!left(expense_definition_id, transactions(amount_cents, settled_at, created_at, category_id))")
            .eq("partnership_id", partnershipId)
            .eq("is_active", true),
          supabase
            .from("couple_split_settings")
            .select("category_name, expense_definition_id, split_type, owner_percentage")
            .eq("partnership_id", partnershipId),
          supabase
            .from("category_mappings")
            .select("up_category_id, new_parent_name, new_child_name")
            .order("display_order"),
        ]);

        // Map to engine input types
        const categoryMappings: CategoryMapping[] = (rawMappings || []).map(m => ({
          up_category_id: m.up_category_id,
          new_parent_name: m.new_parent_name,
          new_child_name: m.new_child_name,
        }));

        const catLookup = new Map<string, { parent: string; child: string }>();
        for (const m of categoryMappings) catLookup.set(m.up_category_id, { parent: m.new_parent_name, child: m.new_child_name });

        const incomeSources: IncomeSourceInput[] = (rawIncome || []).map(s => ({
          amount_cents: s.amount_cents, frequency: s.frequency, source_type: s.source_type,
          is_received: s.is_received, received_date: s.received_date, user_id: s.user_id,
          is_manual_partner_income: s.is_manual_partner_income,
        }));

        const assignments: AssignmentInput[] = (rawAssignments || []).map(a => ({
          category_name: a.category_name, subcategory_name: a.subcategory_name,
          assigned_cents: a.assigned_cents, assignment_type: a.assignment_type,
          goal_id: a.goal_id, asset_id: a.asset_id,
        }));

        const transactions: TransactionInput[] = (rawTransactions || []).map((t: Record<string, unknown>) => {
          const raw = (t as Record<string, unknown>).expense_matches;
          const matchedExpenseId = raw
            ? (Array.isArray(raw) ? (raw[0] as Record<string, unknown>)?.expense_definition_id : (raw as Record<string, unknown>).expense_definition_id) ?? null
            : null;
          return {
            id: t.id as string,
            amount_cents: t.amount_cents as number,
            category_id: t.category_id as string | null,
            created_at: t.settled_at as string,
            split_override_percentage: null,
            matched_expense_id: matchedExpenseId as string | null,
          };
        });

        const expenseDefinitions: ExpenseDefInput[] = (rawExpenseDefs || []).map((exp: Record<string, unknown>) => {
          let categoryName = "";
          let inferredSubcategory: string | null = null;
          const matches = exp.expense_matches as Array<{ transactions: { category_id: string | null } | { category_id: string | null }[] | null }> | null;
          if (matches && matches.length > 0) {
            const catCounts = new Map<string, number>();
            for (const match of matches) {
              const txns = match.transactions;
              if (!txns) continue;
              const txnArray = Array.isArray(txns) ? txns : [txns];
              for (const txn of txnArray) {
                if (txn.category_id) catCounts.set(txn.category_id, (catCounts.get(txn.category_id) ?? 0) + 1);
              }
            }
            let maxCount = 0; let bestCatId: string | null = null;
            for (const [catId, count] of catCounts) { if (count > maxCount) { maxCount = count; bestCatId = catId; } }
            if (bestCatId) {
              const mapping = catLookup.get(bestCatId);
              if (mapping) { categoryName = mapping.parent; inferredSubcategory = mapping.child; }
            }
          }
          return {
            id: exp.id as string,
            category_name: categoryName,
            expected_amount_cents: exp.expected_amount_cents as number,
            recurrence_type: exp.recurrence_type as string,
            inferred_subcategory: inferredSubcategory,
          };
        });

        const splitSettings: SplitSettingInput[] = (rawSplits || []).map(s => ({
          category_name: s.category_name,
          expense_definition_id: s.expense_definition_id,
          split_type: s.split_type,
          owner_percentage: s.owner_percentage != null ? Number(s.owner_percentage) : undefined,
        }));

        // Call the budget engine
        const summary = calculateBudgetSummary({
          periodType: budgetPeriodType,
          budgetView: budgetView as BudgetView,
          carryoverMode: "none",
          methodology: budgetMethodology,
          totalBudget,
          userId: userId || "",
          ownerUserId,
          periodRange,
          incomeSources,
          assignments,
          transactions,
          expenseDefinitions,
          splitSettings,
          categoryMappings,
          carryoverFromPrevious: 0,
        });

        // Format rows for AI consumption
        let onTrackCount = 0;
        let overBudgetCount = 0;
        const rows = summary.rows.map(r => {
          const isOver = r.spent > r.budgeted && r.budgeted > 0;
          if (isOver) overBudgetCount++;
          else if (r.budgeted > 0) onTrackCount++;

          return {
            name: r.name,
            parentCategory: r.parentCategory || null,
            type: r.type,
            budgeted: `$${(r.budgeted / 100).toFixed(2)}`,
            spent: `$${(r.spent / 100).toFixed(2)}`,
            remaining: `$${(r.available / 100).toFixed(2)}`,
            percentUsed: r.budgeted > 0 ? `${((r.spent / r.budgeted) * 100).toFixed(1)}%` : "N/A",
            isOverBudget: isOver,
            isExpenseDefault: r.isExpenseDefault,
          };
        });

        return {
          periodLabel: periodRange.label,
          periodType: budgetPeriodType,
          budgetView,
          income: `$${(summary.income / 100).toFixed(2)}`,
          toBeBudgeted: `$${(summary.tbb / 100).toFixed(2)}`,
          totalBudgeted: `$${(summary.budgeted / 100).toFixed(2)}`,
          totalSpent: `$${(summary.spent / 100).toFixed(2)}`,
          totalRemaining: `$${((summary.budgeted - summary.spent) / 100).toFixed(2)}`,
          rows,
          summary: {
            onTrackCount,
            overBudgetCount,
            rowCount: summary.rows.length,
          },
        };
      },
    }),

    getPaySchedule: tool({
      description:
        "Get the user's pay/income schedule information including next pay date, frequency, and amount. Returns all active income sources for the user and their partner.",
      inputSchema: z.object({}),
      execute: async () => {
        const query = partnershipId
          ? supabase
              .from("income_sources")
              .select("name, source_type, amount_cents, frequency, next_pay_date, notes")
              .eq("partnership_id", partnershipId)
              .eq("is_active", true)
          : supabase
              .from("income_sources")
              .select("name, source_type, amount_cents, frequency, next_pay_date, notes")
              .eq("user_id", userId)
              .eq("is_active", true);

        const { data: sources } = await query;

        return {
          incomeSources: (sources as Array<Record<string, unknown>> || []).map((s) => ({
            name: s.name,
            type: s.source_type,
            frequency: s.frequency,
            nextPayDate: advancePayDate(s.next_pay_date as string | null, s.frequency as string | null),
            amount: `$${((s.amount_cents as number) / 100).toFixed(2)}`,
            notes: s.notes,
          })),
        };
      },
    }),

    getCategoryList: tool({
      description:
        "Get the list of all spending categories with their display names. Use this to understand the category system before querying spending data.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: mappings } = await supabase
          .from("category_mappings")
          .select("up_category_id, new_parent_name, new_child_name, icon")
          .order("display_order");

        const parents = new Map<string, { icon: string; children: string[] }>();
        (mappings as Array<Record<string, unknown>> || []).forEach((m) => {
          const parentName = m.new_parent_name as string;
          const childName = m.new_child_name as string;
          const existing = parents.get(parentName) || { icon: (m.icon as string) || "", children: [] };
          if (childName && !existing.children.includes(childName)) {
            existing.children.push(childName);
          }
          parents.set(parentName, existing);
        });

        return {
          categories: [...parents.entries()].map(([name, data]) => ({
            name,
            icon: data.icon,
            subcategories: data.children,
          })),
          specialCategories: [
            "internal-transfer", "external-transfer", "round-up", "salary-income", "interest", "investments"
          ],
        };
      },
    }),

    getDailySpending: tool({
      description:
        "Get day-by-day spending for a given month. Useful for spotting daily patterns or finding high-spend days.",
      inputSchema: z.object({
        month: z.string().describe("Month in YYYY-MM format"),
      }),
      inputExamples: [
        { input: { month: "2025-01" } },
      ],
      execute: async ({ month }) => {
        const startDate = `${month}-01`;
        const endDate = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0);
        const endDateStr = `${month}-${endDate.getDate().toString().padStart(2, "0")}T23:59:59`;

        const { data: transactions } = await supabase
          .from("transactions")
          .select("amount_cents, settled_at, description")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null)
          .not("category_id", "in", "(internal-transfer,round-up,external-transfer)")
          .gte("settled_at", startDate)
          .lte("settled_at", endDateStr)
          .order("settled_at", { ascending: true });

        const daily = new Map<string, { total: number; count: number; biggest: { desc: string; amount: number } }>();

        (transactions as Array<Record<string, unknown>> || []).forEach((t) => {
          if (!t.settled_at) return;
          const day = (t.settled_at as string).substring(0, 10);
          const existing = daily.get(day) || { total: 0, count: 0, biggest: { desc: "", amount: 0 } };
          const amount = Math.abs(t.amount_cents as number);
          existing.total += amount;
          existing.count += 1;
          if (amount > existing.biggest.amount) {
            existing.biggest = { desc: t.description as string, amount };
          }
          daily.set(day, existing);
        });

        const days = [...daily.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, data]) => ({
            date: day,
            total: `$${(data.total / 100).toFixed(2)}`,
            transactions: data.count,
            biggestPurchase: `${data.biggest.desc} ($${(data.biggest.amount / 100).toFixed(2)})`,
          }));

        const totalSpent = [...daily.values()].reduce((sum, d) => sum + d.total, 0);
        const daysWithSpending = daily.size;

        return {
          month,
          totalSpent: `$${(totalSpent / 100).toFixed(2)}`,
          daysWithSpending,
          averageDailySpend: daysWithSpending > 0 ? `$${(totalSpent / daysWithSpending / 100).toFixed(2)}` : "$0.00",
          days,
        };
      },
    }),

    // ============================================================
    // POWER QUERY TOOL — General-purpose read-only exploration
    // ============================================================

    queryFinancialData: tool({
      description: `Run a custom read-only query against any financial table. Use this for complex questions, cross-table lookups, or anything the predefined tools can't answer.

TABLE SCHEMAS (use these exact column names):

transactions: id, account_id, description, raw_text, amount_cents, status, category_id, parent_category_id, settled_at (timestamp), created_at (timestamp), transfer_account_id, transaction_type, is_income, income_type, round_up_amount_cents, foreign_amount_cents, foreign_currency_code

accounts: id, user_id, display_name, account_type (TRANSACTIONAL/SAVER/HOME_LOAN), balance_cents, is_active, created_at, updated_at

expense_definitions: id, partnership_id, name, category_name, expected_amount_cents, recurrence_type (weekly/fortnightly/monthly/quarterly/yearly/one-time), next_due_date, match_pattern, merchant_name, is_active, emoji, notes, auto_detected, created_at

expense_matches: id, expense_definition_id, transaction_id, match_confidence, matched_at, for_period

savings_goals: id, partnership_id, name, target_amount_cents, current_amount_cents, deadline, linked_account_id, icon, color, is_completed, completed_at, created_at

income_sources: id, user_id, partnership_id, name, source_type, amount_cents, frequency, last_pay_date, next_pay_date, match_pattern, is_active, notes

budget_assignments: id, partnership_id, month (date, first of month), category_name, assigned_cents, assignment_type (category/goal/asset), subcategory_name, goal_id, asset_id, budget_view (individual/shared), budget_id, stored_period_type, rollover, notes, created_at

budget_months: id, partnership_id, month (date), income_total_cents, assigned_total_cents, carryover_from_previous_cents, budget_id, notes

user_budgets: id, partnership_id, name, emoji, budget_type (personal/household/custom), methodology, budget_view (individual/shared), period_type (weekly/fortnightly/monthly), is_active, is_default, carryover_mode (always 'none' - fresh each period), total_budget, start_date, end_date

couple_split_settings: id, partnership_id, category_name, expense_definition_id, split_type (equal/custom/individual-owner/individual-partner), owner_percentage

investments: id, partnership_id, asset_type (stock/etf/crypto/property/other), name, ticker_symbol, quantity, purchase_value_cents, current_value_cents, notes

goal_contributions: id, goal_id, amount_cents, balance_after_cents, source (manual/webhook_sync/budget_allocation/initial), created_at

target_allocations: id, partnership_id, asset_type, target_percentage

category_mappings: up_category_id, new_parent_name, new_child_name, icon, display_order

IMPORTANT: For date ordering on transactions, use 'settled_at' or 'created_at' — there is NO 'date' or 'transaction_date' column.`,
      inputSchema: z.object({
        table: z
          .string()
          .describe("The table to query (e.g. 'transactions', 'savings_goals')"),
        select: z
          .string()
          .optional()
          .describe("Columns to select (Supabase select syntax, e.g. 'name, amount_cents'). REQUIRED: always specify explicit column names."),
        filters: z
          .array(
            z.object({
              column: z.string().describe("Column name"),
              operator: z
                .enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "not.in"])
                .describe("Supabase filter operator"),
              value: z.union([z.string(), z.number(), z.boolean(), z.null()]).describe("Filter value"),
            })
          )
          .optional()
          .describe("Array of filters to apply"),
        orderBy: z
          .object({
            column: z.string(),
            ascending: z.boolean().optional(),
          })
          .optional()
          .describe("Sort order"),
        limit: z
          .number()
          .optional()
          .describe("Max rows to return (default 100, max 500)"),
      }),
      inputExamples: [
        { input: { table: "transactions", select: "description, amount_cents, settled_at", filters: [{ column: "settled_at", operator: "gte", value: "2025-01-01" }], orderBy: { column: "settled_at", ascending: true }, limit: 1 } },
        { input: { table: "savings_goals", select: "name, target_amount_cents, current_amount_cents, deadline" } },
        { input: { table: "income_sources", select: "name, amount_cents, frequency" } },
        { input: { table: "transactions", select: "description, amount_cents", filters: [{ column: "description", operator: "ilike", value: "%Woolworths%" }], orderBy: { column: "settled_at", ascending: false }, limit: 10 } },
      ],
      execute: async ({ table, select: rawSelect, filters = [], orderBy, limit = 100 }) => {
        // Validate select parameter - reject nested relation traversal
        if (rawSelect && /[()]/.test(rawSelect)) {
          return { error: "Invalid select parameter: nested relations are not allowed" };
        }

        // Validate column names - reject any containing parentheses
        const invalidColumnPattern = /[()]/;
        if (filters?.some(f => invalidColumnPattern.test(f.column))) {
          return { error: "Invalid filter column name" };
        }
        if (orderBy?.column && invalidColumnPattern.test(orderBy.column)) {
          return { error: "Invalid orderBy column name" };
        }

        const ALLOWED_TABLES = [
          "transactions", "accounts", "expense_definitions", "expense_matches",
          "savings_goals", "income_sources", "budget_assignments", "budget_months",
          "category_mappings", "categories", "couple_split_settings", "investments",
          "investment_history",
          "tags", "net_worth_snapshots", "budget_category_shares",
          "user_budgets", "goal_contributions", "target_allocations",
          "transaction_share_overrides", "annual_checkups", "watchlist_items",
          // "profiles" removed — dedicated tools cover profile needs
          // "transaction_category_overrides" removed — use recategorizeTransaction tool instead
          // "transaction_tags" removed — cannot scope without subquery; RLS is insufficient defense alone
        ];

        if (!ALLOWED_TABLES.includes(table)) {
          return { error: `Table '${table}' is not allowed. Allowed tables: ${ALLOWED_TABLES.join(", ")}` };
        }

        const ALLOWED_COLUMNS: Record<string, Set<string>> = {
          transactions: new Set(["id", "account_id", "up_transaction_id", "description", "raw_text", "message", "amount_cents", "currency_code", "status", "category_id", "parent_category_id", "settled_at", "created_at", "foreign_amount_cents", "foreign_currency_code", "transfer_account_id", "is_categorizable", "transaction_type", "is_income", "income_type", "is_one_off_income", "is_internal_transfer", "internal_transfer_type", "performing_customer", "is_shared", "category_name", "parent_category_name", "merchant_name", "hold_info_amount_cents", "hold_info_foreign_amount_cents", "hold_info_foreign_currency_code", "round_up_amount_cents", "round_up_boost_cents", "cashback_amount_cents", "cashback_description", "card_purchase_method", "card_number_suffix", "linked_pay_schedule_id", "deep_link_url"]),
          accounts: new Set(["id", "user_id", "up_account_id", "display_name", "account_type", "ownership_type", "balance_cents", "currency_code", "is_active", "last_synced_at", "created_at", "updated_at"]),
          expense_definitions: new Set(["id", "partnership_id", "name", "category_name", "expected_amount_cents", "recurrence_type", "next_due_date", "auto_detected", "match_pattern", "is_active", "emoji", "notes", "created_by", "created_at", "updated_at", "linked_up_transaction_id", "merchant_name"]),
          expense_matches: new Set(["id", "expense_definition_id", "transaction_id", "match_confidence", "matched_at", "matched_by", "for_period"]),
          savings_goals: new Set(["id", "partnership_id", "name", "target_amount_cents", "current_amount_cents", "deadline", "linked_account_id", "icon", "color", "is_completed", "completed_at", "created_at", "updated_at"]),
          income_sources: new Set(["id", "user_id", "partnership_id", "name", "source_type", "one_off_type", "amount_cents", "frequency", "last_pay_date", "next_pay_date", "expected_date", "received_date", "is_received", "linked_transaction_id", "match_pattern", "notes", "is_active", "created_at", "updated_at", "linked_up_transaction_id", "is_manual_partner_income"]),
          budget_assignments: new Set(["id", "partnership_id", "month", "category_name", "assigned_cents", "notes", "created_by", "created_at", "updated_at", "assignment_type", "goal_id", "asset_id", "subcategory_name", "stored_period_type", "rollover", "budget_view", "budget_id"]),
          budget_months: new Set(["id", "partnership_id", "month", "income_total_cents", "assigned_total_cents", "carryover_from_previous_cents", "notes", "created_at", "updated_at", "budget_id"]),
          category_mappings: new Set(["id", "up_category_id", "new_parent_name", "new_child_name", "icon", "display_order", "created_at"]),
          categories: new Set(["id", "name", "parent_category_id", "created_at"]),
          couple_split_settings: new Set(["id", "partnership_id", "category_name", "expense_definition_id", "split_type", "owner_percentage", "notes", "created_at", "updated_at"]),
          investments: new Set(["id", "partnership_id", "asset_type", "name", "ticker_symbol", "quantity", "purchase_value_cents", "current_value_cents", "currency_code", "notes", "created_at", "updated_at"]),
          investment_history: new Set(["id", "investment_id", "value_cents", "recorded_at"]),
          tags: new Set(["name", "created_at"]),
          net_worth_snapshots: new Set(["id", "partnership_id", "snapshot_date", "total_balance_cents", "account_breakdown", "created_at", "investment_total_cents"]),
          budget_category_shares: new Set(["id", "partnership_id", "category_name", "share_percentage", "is_shared", "created_at", "updated_at"]),
          user_budgets: new Set(["id", "partnership_id", "name", "emoji", "budget_type", "methodology", "budget_view", "period_type", "is_active", "is_default", "color", "template_source", "category_filter", "created_by", "created_at", "updated_at", "total_budget", "start_date", "end_date", "carryover_mode", "slug"]),
          goal_contributions: new Set(["id", "goal_id", "amount_cents", "balance_after_cents", "source", "created_at"]),
          target_allocations: new Set(["id", "partnership_id", "asset_type", "target_percentage", "created_at", "updated_at"]),
          transaction_share_overrides: new Set(["id", "transaction_id", "partnership_id", "share_percentage", "is_shared", "notes", "created_at", "updated_at"]),
          annual_checkups: new Set(["id", "partnership_id", "financial_year", "current_step", "step_data", "action_items", "started_at", "completed_at", "created_by", "created_at", "updated_at"]),
          watchlist_items: new Set(["id", "partnership_id", "asset_type", "name", "ticker_symbol", "notes", "last_price_cents", "last_price_updated_at", "created_at", "updated_at"]),
        };

        // Expand "*" or missing select to explicit allowed columns for the table
        const tableColumns = ALLOWED_COLUMNS[table];
        let select: string;
        if (!rawSelect || rawSelect === "*") {
          if (!tableColumns) {
            return { error: `No column allowlist defined for table '${table}'` };
          }
          select = [...tableColumns].join(", ");
        } else {
          select = rawSelect;
        }

        // Validate select columns against allowlist
        if (tableColumns) {
          const selectCols = select.split(",").map((c: string) => c.trim());
          for (const col of selectCols) {
            if (!tableColumns.has(col)) {
              return { error: `Invalid column: ${col} is not allowed for table ${table}` };
            }
          }
        }

        // Validate filter columns
        for (const f of filters) {
          if (tableColumns && !tableColumns.has(f.column)) {
            return { error: `Invalid column: ${f.column} is not allowed for table ${table}` };
          }
        }

        // Validate orderBy column
        if (orderBy?.column && tableColumns && !tableColumns.has(orderBy.column)) {
          return { error: `Invalid column: ${orderBy.column} is not allowed for table ${table}` };
        }

        const cappedLimit = Math.min(limit, 500);
        let q = supabase.from(table).select(select).limit(cappedLimit);

        // Auto-inject scoping filters based on table
        const ACCOUNT_SCOPED = ["transactions"];
        const PARTNERSHIP_SCOPED = [
          "expense_definitions", "expense_matches", "savings_goals", "budget_assignments",
          "budget_months", "couple_split_settings", "budget_category_shares",
          "transaction_share_overrides", "user_budgets", "target_allocations",
          "investments", "net_worth_snapshots", "annual_checkups", "watchlist_items",
        ];
        const USER_SCOPED = ["income_sources"];
        const RLS_ONLY = ["goal_contributions", "investment_history"];

        if (ACCOUNT_SCOPED.includes(table)) {
          q = q.in("account_id", accountIds);
        } else if (PARTNERSHIP_SCOPED.includes(table)) {
          if (partnershipId) {
            q = q.eq("partnership_id", partnershipId);
          } else {
            return { error: "No partnership configured for this user" };
          }
        } else if (USER_SCOPED.includes(table)) {
          if (userId) {
            q = q.eq("user_id", userId);
          }
        } else if (RLS_ONLY.includes(table)) {
          // These tables are scoped via foreign keys (goal_id, investment_id)
          // RLS handles security; no additional filter needed here
        } else if (table === "accounts") {
          // Scope by partnership: include all accounts belonging to any partnership member
          if (partnershipId) {
            const { data: members } = await supabase
              .from("partnership_members")
              .select("user_id")
              .eq("partnership_id", partnershipId);
            const memberUserIds = members?.map((m: { user_id: string }) => m.user_id) || [];
            q = q.in("user_id", memberUserIds.length > 0 ? memberUserIds : ["__none__"]);
          } else if (userId) {
            q = q.eq("user_id", userId);
          } else {
            q = q.in("id", accountIds.length > 0 ? accountIds : ["__none__"]);
          }
        }
        // category_mappings, categories, tags are global reference tables — no scoping needed

        // Apply user filters
        for (const f of filters) {
          switch (f.operator) {
            case "eq": q = q.eq(f.column, f.value); break;
            case "neq": q = q.neq(f.column, f.value); break;
            case "gt": q = q.gt(f.column, f.value); break;
            case "gte": q = q.gte(f.column, f.value); break;
            case "lt": q = q.lt(f.column, f.value); break;
            case "lte": q = q.lte(f.column, f.value); break;
            case "like": q = q.like(f.column, escapeLikePattern(String(f.value))); break;
            case "ilike": q = q.ilike(f.column, escapeLikePattern(String(f.value))); break;
            case "is": q = q.is(f.column, f.value as null); break;
            case "in": q = q.in(f.column, (f.value as string).split(",")); break;
            case "not.in": {
              const val = String(f.value);
              if (!/^[\w\s,.\-@]+$/.test(val)) {
                return { error: "Invalid not.in filter value" };
              }
              q = q.not(f.column, "in", `(${val})`);
              break;
            }
          }
        }

        if (orderBy) {
          q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
        }

        const result = await q;
        let data = result.data;
        const error = result.error;
        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Strip sensitive columns from profiles table results
        if (table === "profiles" && Array.isArray(data)) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          data = (data as unknown as Record<string, unknown>[]).map(({ ai_api_key, ...safe }) => safe) as unknown as typeof data;
        }

        const rows = data || [];

        // Compact large result sets to reduce token consumption.
        // For 50+ rows, return summary stats + first/last rows instead of all data.
        if (rows.length > 50) {
          const columns = rows.length > 0 ? Object.keys(rows[0] as unknown as Record<string, unknown>) : [];

          // Build per-column summaries for numeric fields
          const numericSummaries: Record<string, { min: number; max: number; sum: number; count: number }> = {};
          for (const row of rows as unknown as Array<Record<string, unknown>>) {
            for (const col of columns) {
              if (typeof row[col] === "number") {
                if (!numericSummaries[col]) {
                  numericSummaries[col] = { min: row[col] as number, max: row[col] as number, sum: 0, count: 0 };
                }
                const s = numericSummaries[col];
                s.min = Math.min(s.min, row[col] as number);
                s.max = Math.max(s.max, row[col] as number);
                s.sum += row[col] as number;
                s.count += 1;
              }
            }
          }

          const summaries: Record<string, { min: number; max: number; avg: number; sum: number }> = {};
          for (const [col, s] of Object.entries(numericSummaries)) {
            summaries[col] = { min: s.min, max: s.max, avg: Math.round(s.sum / s.count), sum: s.sum };
          }

          return {
            table,
            rowCount: rows.length,
            note: `Large result set (${rows.length} rows). Showing first 15 and last 5 rows with numeric summaries.`,
            numericSummaries: summaries,
            firstRows: rows.slice(0, 15),
            lastRows: rows.slice(-5),
          };
        }

        return {
          table,
          rowCount: rows.length,
          rows,
        };
      },
    }),

    // ============================================================
    // ANALYSIS TOOLS
    // ============================================================

    getSpendingVelocity: tool({
      description:
        "Get current month burn rate analysis. Shows days elapsed vs remaining, daily burn rate vs budgeted pace, projected month-end spend, and safe-to-spend-per-day. Use when the user asks if they're spending too fast or wants to know their daily budget.",
      inputSchema: z.object({
        month: z
          .string()
          .optional()
          .describe("Month in YYYY-MM format (defaults to current month)"),
      }),
      inputExamples: [
        { input: {} },
        { input: { month: "2025-01" } },
      ],
      execute: async ({ month }) => {
        const today = new Date();
        const targetMonth = month || `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}`;
        const [year, mon] = targetMonth.split("-").map(Number);

        const daysInMonth = new Date(year, mon, 0).getDate();
        const isCurrentMonth = targetMonth === `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}`;
        const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
        const daysRemaining = daysInMonth - dayOfMonth;

        const startDate = `${targetMonth}-01`;
        const endDateStr = `${targetMonth}-${daysInMonth.toString().padStart(2, "0")}T23:59:59`;

        // Get spending
        const { data: transactions } = await supabase
          .from("transactions")
          .select("amount_cents, category_id, settled_at")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null)
          .not("category_id", "in", "(internal-transfer,round-up,external-transfer)")
          .gte("settled_at", startDate)
          .lte("settled_at", endDateStr);

        const { data: mappings } = await supabase
          .from("category_mappings")
          .select("up_category_id, new_parent_name");

        const categoryMap = new Map<string, string>();
        (mappings as Array<{ up_category_id: string; new_parent_name: string }> || []).forEach(
          (m) => categoryMap.set(m.up_category_id, m.new_parent_name)
        );

        // Get budget
        let totalBudgetCents = 0;
        const budgetByCategory = new Map<string, number>();
        if (partnershipId) {
          const { data: assignments } = await supabase
            .from("budget_assignments")
            .select("category_name, assigned_cents")
            .eq("partnership_id", partnershipId)
            .eq("month", `${targetMonth}-01`);

          (assignments as Array<Record<string, unknown>> || []).forEach((a) => {
            const cents = a.assigned_cents as number;
            totalBudgetCents += cents;
            budgetByCategory.set(a.category_name as string, cents);
          });
        }

        let totalSpentCents = 0;
        const spentByCategory = new Map<string, number>();

        (transactions as Array<Record<string, unknown>> || []).forEach((t) => {
          const amount = Math.abs(t.amount_cents as number);
          totalSpentCents += amount;
          const catName = (t.category_id as string) ? (categoryMap.get(t.category_id as string) || t.category_id as string) : "Uncategorized";
          spentByCategory.set(catName, (spentByCategory.get(catName) || 0) + amount);
        });

        const dailyBurnRate = dayOfMonth > 0 ? totalSpentCents / dayOfMonth : 0;
        const projectedMonthEnd = Math.round(dailyBurnRate * daysInMonth);
        const budgetedDailyRate = totalBudgetCents > 0 ? totalBudgetCents / daysInMonth : 0;
        const remainingBudget = totalBudgetCents - totalSpentCents;
        const safeToSpendPerDay = daysRemaining > 0 && remainingBudget > 0
          ? Math.round(remainingBudget / daysRemaining)
          : 0;

        // Per-category velocity for budgeted categories
        const categoryVelocity = [...budgetByCategory.entries()].map(([cat, budgeted]) => {
          const spent = spentByCategory.get(cat) || 0;
          const catDailyBurn = dayOfMonth > 0 ? spent / dayOfMonth : 0;
          const catProjected = Math.round(catDailyBurn * daysInMonth);
          return {
            category: cat,
            budgeted: `$${(budgeted / 100).toFixed(2)}`,
            spent: `$${(spent / 100).toFixed(2)}`,
            projected: `$${(catProjected / 100).toFixed(2)}`,
            onTrack: catProjected <= budgeted,
            percentUsed: budgeted > 0 ? `${((spent / budgeted) * 100).toFixed(1)}%` : "N/A",
          };
        });

        return {
          month: targetMonth,
          dayOfMonth,
          daysInMonth,
          daysRemaining,
          totalSpent: `$${(totalSpentCents / 100).toFixed(2)}`,
          dailyBurnRate: `$${(dailyBurnRate / 100).toFixed(2)}`,
          projectedMonthEnd: `$${(projectedMonthEnd / 100).toFixed(2)}`,
          totalBudget: totalBudgetCents > 0 ? `$${(totalBudgetCents / 100).toFixed(2)}` : "No budget set",
          budgetedDailyRate: budgetedDailyRate > 0 ? `$${(budgetedDailyRate / 100).toFixed(2)}` : "N/A",
          remainingBudget: totalBudgetCents > 0 ? `$${(remainingBudget / 100).toFixed(2)}` : "N/A",
          safeToSpendPerDay: safeToSpendPerDay > 0 ? `$${(safeToSpendPerDay / 100).toFixed(2)}` : "N/A",
          onTrack: totalBudgetCents > 0 ? projectedMonthEnd <= totalBudgetCents : null,
          categoryVelocity,
        };
      },
    }),

    getCashflowForecast: tool({
      description:
        "Project cash flow 1-6 months forward. Combines current account balances, average recent income from actual transactions, recurring expense_definitions, and average historical discretionary spending. Use when the user asks about affording something, planning ahead, or wants to know projected balances.",
      inputSchema: z.object({
        monthsAhead: z
          .number()
          .optional()
          .describe("Number of months to forecast (default 3, max 6)"),
      }),
      inputExamples: [
        { input: { monthsAhead: 3 } },
        { input: { monthsAhead: 6 } },
      ],
      execute: async ({ monthsAhead = 3 }) => {
        const months = Math.min(monthsAhead, 6);
        const today = new Date();

        // Get current balances
        const { data: accounts } = await supabase
          .from("accounts")
          .select("display_name, balance_cents, account_type")
          .in("id", accountIds);

        const totalBalance = (accounts as Array<Record<string, unknown>> || [])
          .reduce((sum, a) => sum + (a.balance_cents as number), 0);

        // Use ACTUAL income from transactions (last 3 months) as primary source.
        // This is more reliable than the income_sources table which may have stale
        // or incorrectly entered data.
        const threeMonthsAgoIncome = new Date();
        threeMonthsAgoIncome.setMonth(threeMonthsAgoIncome.getMonth() - 3);

        const { data: incomeTransactions } = await supabase
          .from("transactions")
          .select("amount_cents")
          .in("account_id", accountIds)
          .gt("amount_cents", 0)
          .is("transfer_account_id", null)
          .not("category_id", "in", "(internal-transfer,round-up,external-transfer)")
          .gte("settled_at", threeMonthsAgoIncome.toISOString());

        const totalActualIncome = (incomeTransactions as Array<Record<string, unknown>> || [])
          .reduce((sum, t) => sum + (t.amount_cents as number), 0);
        const monthlyIncomeCents = Math.round(totalActualIncome / 3);

        // Get recurring expenses
        let expenseQuery = supabase
          .from("expense_definitions")
          .select("name, expected_amount_cents, recurrence_type")
          .eq("is_active", true);

        if (partnershipId) {
          expenseQuery = expenseQuery.eq("partnership_id", partnershipId);
        }

        const { data: expenses } = await expenseQuery;

        let monthlyFixedExpenseCents = 0;
        for (const exp of (expenses as Array<Record<string, unknown>> || [])) {
          const amount = exp.expected_amount_cents as number;
          switch (exp.recurrence_type) {
            case "weekly": monthlyFixedExpenseCents += Math.round(amount * 52 / 12); break;
            case "fortnightly": monthlyFixedExpenseCents += Math.round(amount * 26 / 12); break;
            case "monthly": monthlyFixedExpenseCents += amount; break;
            case "quarterly": monthlyFixedExpenseCents += Math.round(amount / 3); break;
            case "yearly": monthlyFixedExpenseCents += Math.round(amount / 12); break;
            default: monthlyFixedExpenseCents += amount;
          }
        }

        // Get average discretionary spending (last 3 months)
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const { data: recentTxns } = await supabase
          .from("transactions")
          .select("amount_cents, settled_at")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null)
          .not("category_id", "in", "(internal-transfer,round-up,external-transfer)")
          .gte("settled_at", threeMonthsAgo.toISOString());

        let totalRecentSpending = 0;
        (recentTxns as Array<Record<string, unknown>> || []).forEach((t) => {
          totalRecentSpending += Math.abs(t.amount_cents as number);
        });
        const avgMonthlyTotalSpending = Math.round(totalRecentSpending / 3);
        const avgDiscretionaryCents = Math.max(0, avgMonthlyTotalSpending - monthlyFixedExpenseCents);

        // Get next pay date from income_sources (not legacy pay_schedules)
        let nextPayDate: string | null = null;
        const incomeQuery = partnershipId
          ? supabase
              .from("income_sources")
              .select("next_pay_date, frequency")
              .eq("partnership_id", partnershipId)
              .eq("is_active", true)
              .eq("source_type", "recurring-salary")
              .not("next_pay_date", "is", null)
          : userId
            ? supabase
                .from("income_sources")
                .select("next_pay_date, frequency")
                .eq("user_id", userId)
                .eq("is_active", true)
                .eq("source_type", "recurring-salary")
                .not("next_pay_date", "is", null)
            : null;

        if (incomeQuery) {
          const { data: incomeSources } = await incomeQuery;
          if (incomeSources && (incomeSources as Array<Record<string, unknown>>).length > 0) {
            // Advance all dates, then pick the soonest
            const advancedDates = (incomeSources as Array<Record<string, unknown>>)
              .map((s) => advancePayDate(s.next_pay_date as string, s.frequency as string))
              .filter((d): d is string => d !== null)
              .sort();
            if (advancedDates.length > 0) {
              nextPayDate = advancedDates[0];
            }
          }
        }

        const daysUntilPay = nextPayDate
          ? Math.max(0, Math.ceil((new Date(nextPayDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
          : null;

        const totalMonthlyExpenses = monthlyFixedExpenseCents + avgDiscretionaryCents;
        const monthlySurplus = monthlyIncomeCents - totalMonthlyExpenses;

        // Project forward
        const projections = [];
        let runningBalance = totalBalance;
        for (let i = 1; i <= months; i++) {
          runningBalance += monthlySurplus;
          const projMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
          projections.push({
            month: `${projMonth.getFullYear()}-${(projMonth.getMonth() + 1).toString().padStart(2, "0")}`,
            projectedBalance: `$${(runningBalance / 100).toFixed(2)}`,
            projectedBalanceCents: runningBalance,
            income: `$${(monthlyIncomeCents / 100).toFixed(2)}`,
            fixedExpenses: `$${(monthlyFixedExpenseCents / 100).toFixed(2)}`,
            discretionary: `$${(avgDiscretionaryCents / 100).toFixed(2)}`,
            surplus: `$${(monthlySurplus / 100).toFixed(2)}`,
          });
        }

        // Safe to spend today = remaining balance after fixed obligations until next pay
        const dailyDiscretionary = avgDiscretionaryCents / 30;
        const safeToSpendToday = daysUntilPay !== null && daysUntilPay > 0
          ? Math.round((totalBalance - (monthlyFixedExpenseCents / 30 * daysUntilPay)) / daysUntilPay)
          : Math.round(dailyDiscretionary);

        return {
          currentBalance: `$${(totalBalance / 100).toFixed(2)}`,
          monthlyIncome: `$${(monthlyIncomeCents / 100).toFixed(2)}`,
          monthlyFixedExpenses: `$${(monthlyFixedExpenseCents / 100).toFixed(2)}`,
          monthlyDiscretionary: `$${(avgDiscretionaryCents / 100).toFixed(2)}`,
          monthlySurplus: `$${(monthlySurplus / 100).toFixed(2)}`,
          nextPayDate,
          daysUntilPay,
          safeToSpendToday: `$${(safeToSpendToday / 100).toFixed(2)}`,
          projections,
        };
      },
    }),

    getSubscriptionCostTrajectory: tool({
      description:
        "Get all recurring expenses (subscriptions/bills) and analyze cost changes over time. Shows price increase history, total quarterly/annual costs. Uses the user's defined expense_definitions as the source of truth.",
      inputSchema: z.object({
        months: z
          .number()
          .optional()
          .describe("Number of months of transaction history to analyze for price changes (default 12)"),
      }),
      inputExamples: [
        { input: { months: 12 } },
        { input: { months: 6 } },
      ],
      execute: async ({ months = 12 }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        // Fetch expense definitions (the authoritative list of subscriptions)
        const { data: expenses } = await supabase
          .from("expense_definitions")
          .select("id, name, merchant_name, expected_amount_cents, recurrence_type, category_name, emoji, next_due_date, is_active")
          .eq("partnership_id", partnershipId)
          .eq("is_active", true);

        if (!expenses || expenses.length === 0) {
          return { subscriptionCount: 0, totalMonthlyCost: "$0.00", totalAnnualCost: "$0.00", subscriptions: [] };
        }

        // Fetch transaction history for price change analysis
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const { data: transactions } = await supabase
          .from("transactions")
          .select("description, amount_cents, created_at")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .gte("created_at", startDate.toISOString())
          .order("created_at", { ascending: true });

        const txns = (transactions || []) as Array<{ description: string; amount_cents: number; created_at: string }>;

        // Pre-group transactions by lowercase description for O(unique_descriptions) lookup per expense
        // instead of O(transactions) per expense
        const txnsByDescription = new Map<string, Array<{ description: string; amount_cents: number; created_at: string }>>();
        for (const t of txns) {
          const descLower = t.description.toLowerCase();
          let group = txnsByDescription.get(descLower);
          if (!group) {
            group = [];
            txnsByDescription.set(descLower, group);
          }
          group.push(t);
        }
        const uniqueDescriptions = Array.from(txnsByDescription.keys());

        const getMonthly = (cents: number, freq: string) => {
          switch (freq) {
            case "weekly": return Math.round(cents * 4.33);
            case "fortnightly": return Math.round(cents * 2.17);
            case "monthly": return cents;
            case "quarterly": return Math.round(cents / 3);
            case "yearly": return Math.round(cents / 12);
            default: return cents;
          }
        };

        const getAnnual = (cents: number, freq: string) => {
          switch (freq) {
            case "weekly": return cents * 52;
            case "fortnightly": return cents * 26;
            case "monthly": return cents * 12;
            case "quarterly": return cents * 4;
            case "yearly": return cents;
            default: return cents * 12;
          }
        };

        let totalMonthlyCents = 0;
        let totalAnnualCents = 0;

        const subDetails = (expenses as Array<Record<string, unknown>>).map((exp) => {
          const amount = (exp.expected_amount_cents as number) || 0;
          const freq = (exp.recurrence_type as string) || "monthly";
          const merchant = (exp.merchant_name as string) || (exp.name as string);

          const monthlyCost = getMonthly(amount, freq);
          const annualCost = getAnnual(amount, freq);
          totalMonthlyCents += monthlyCost;
          totalAnnualCents += annualCost;

          // Find matching transactions via pre-grouped map: O(unique_descriptions) substring checks
          // instead of O(all_transactions) per expense
          const merchantLower = merchant.toLowerCase();
          const merchantTxns: Array<{ description: string; amount_cents: number; created_at: string }> = [];
          for (const desc of uniqueDescriptions) {
            if (desc.includes(merchantLower)) {
              merchantTxns.push(...txnsByDescription.get(desc)!);
            }
          }
          merchantTxns.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          const priceChanges: Array<{ date: string; from: string; to: string; changePercent: string }> = [];
          for (let i = 1; i < merchantTxns.length; i++) {
            const prev = Math.abs(merchantTxns[i - 1].amount_cents);
            const curr = Math.abs(merchantTxns[i].amount_cents);
            const pctChange = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
            if (Math.abs(pctChange) > 5) {
              priceChanges.push({
                date: merchantTxns[i].created_at.substring(0, 10),
                from: `$${(prev / 100).toFixed(2)}`,
                to: `$${(curr / 100).toFixed(2)}`,
                changePercent: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`,
              });
            }
          }

          return {
            name: exp.name,
            merchant,
            emoji: exp.emoji,
            category: exp.category_name,
            currentAmount: `$${(amount / 100).toFixed(2)}`,
            frequency: freq,
            annualCost: `$${(annualCost / 100).toFixed(2)}`,
            nextDueDate: exp.next_due_date,
            priceChanges,
            matchedTransactions: merchantTxns.length,
          };
        });

        return {
          subscriptionCount: expenses.length,
          totalMonthlyCost: `$${(totalMonthlyCents / 100).toFixed(2)}`,
          totalQuarterlyCost: `$${(totalMonthlyCents * 3 / 100).toFixed(2)}`,
          totalAnnualCost: `$${(totalAnnualCents / 100).toFixed(2)}`,
          subscriptions: subDetails,
        };
      },
    }),

    getCoupleSplitAnalysis: tool({
      description:
        "Analyze expense split fairness between partners. Uses configured split settings, income ratios, and actual spending to calculate who is paying more/less than their share. Shows per-category breakdown and overall fairness score.",
      inputSchema: z.object({
        month: z
          .string()
          .optional()
          .describe("Month in YYYY-MM format (defaults to current month)"),
      }),
      inputExamples: [
        { input: {} },
        { input: { month: "2025-01" } },
      ],
      execute: async ({ month }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        const today = new Date();
        const targetMonth = month || `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}`;
        const startDate = `${targetMonth}-01`;
        const [year, mon] = targetMonth.split("-").map(Number);
        const daysInMonth = new Date(year, mon, 0).getDate();
        const endDateStr = `${targetMonth}-${daysInMonth.toString().padStart(2, "0")}T23:59:59`;

        // Get split settings
        const { data: splitSettings } = await supabase
          .from("couple_split_settings")
          .select("category_name, owner_percentage, split_type")
          .eq("partnership_id", partnershipId);

        // Get income sources
        const { data: incomeSources } = await supabase
          .from("income_sources")
          .select("name, amount_cents, frequency, user_id")
          .eq("partnership_id", partnershipId);

        // Calculate monthly income per person
        let user1Income = 0;
        let user2Income = 0;
        for (const src of (incomeSources as Array<Record<string, unknown>> || [])) {
          const amount = src.amount_cents as number;
          let monthly = amount;
          switch (src.frequency) {
            case "weekly": monthly = Math.round(amount * 52 / 12); break;
            case "fortnightly": monthly = Math.round(amount * 26 / 12); break;
            case "quarterly": monthly = Math.round(amount / 3); break;
            case "yearly": monthly = Math.round(amount / 12); break;
          }
          if (src.user_id !== userId) {
            user2Income += monthly;
          } else {
            user1Income += monthly;
          }
        }

        const totalIncome = user1Income + user2Income;
        const incomeRatio = totalIncome > 0 ? user1Income / totalIncome : 0.5;

        // Get spending
        const { data: transactions } = await supabase
          .from("transactions")
          .select("amount_cents, category_id, account_id")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null)
          .gte("settled_at", startDate)
          .lte("settled_at", endDateStr);

        const { data: mappings } = await supabase
          .from("category_mappings")
          .select("up_category_id, new_parent_name");

        const categoryMap = new Map<string, string>();
        (mappings as Array<{ up_category_id: string; new_parent_name: string }> || []).forEach(
          (m) => categoryMap.set(m.up_category_id, m.new_parent_name)
        );

        // Build split lookup
        const splitMap = new Map<string, { ownerPct: number; type: string }>();
        (splitSettings as Array<Record<string, unknown>> || []).forEach((s) => {
          const splitType = (s.split_type as string) || "equal";
          let ownerPct = 50;
          if (splitType === "custom" && s.owner_percentage != null) {
            ownerPct = s.owner_percentage as number;
          } else if (splitType === "individual-owner") {
            ownerPct = 100;
          } else if (splitType === "individual-partner") {
            ownerPct = 0;
          }
          splitMap.set(s.category_name as string, {
            ownerPct,
            type: splitType,
          });
        });

        // Aggregate by category
        const spendingByCategory = new Map<string, number>();
        let totalSpent = 0;
        (transactions as Array<Record<string, unknown>> || []).forEach((t) => {
          const amount = Math.abs(t.amount_cents as number);
          const catId = t.category_id as string;
          const catName = catId ? (categoryMap.get(catId) || catId) : "Uncategorized";
          spendingByCategory.set(catName, (spendingByCategory.get(catName) || 0) + amount);
          totalSpent += amount;
        });

        // Calculate fairness per category
        const categoryBreakdown = [...spendingByCategory.entries()].map(([cat, spent]) => {
          const split = splitMap.get(cat);
          const user1Share = split ? split.ownerPct / 100 : incomeRatio;
          const user1ShouldPay = Math.round(spent * user1Share);
          const user2ShouldPay = spent - user1ShouldPay;

          return {
            category: cat,
            totalSpent: `$${(spent / 100).toFixed(2)}`,
            user1Share: `${(user1Share * 100).toFixed(0)}%`,
            user1ShouldPay: `$${(user1ShouldPay / 100).toFixed(2)}`,
            user2ShouldPay: `$${(user2ShouldPay / 100).toFixed(2)}`,
            hasCustomSplit: !!split,
          };
        }).sort((a, b) => parseFloat(b.totalSpent.replace("$", "")) - parseFloat(a.totalSpent.replace("$", "")));

        return {
          month: targetMonth,
          user1MonthlyIncome: `$${(user1Income / 100).toFixed(2)}`,
          user2MonthlyIncome: `$${(user2Income / 100).toFixed(2)}`,
          incomeRatio: `${(incomeRatio * 100).toFixed(0)}% / ${((1 - incomeRatio) * 100).toFixed(0)}%`,
          totalSpent: `$${(totalSpent / 100).toFixed(2)}`,
          categoryBreakdown,
          configuredSplits: (splitSettings as Array<Record<string, unknown>> || []).length,
        };
      },
    }),

    // ============================================================
    // DETECTION TOOLS — Pattern recognition from transaction history
    // ============================================================

    detectRecurringExpenses: tool({
      description:
        "Detect recurring expense patterns from transaction history. Call this BEFORE createExpenseDefinition to pre-fill from real data. Cross-references against existing expense definitions to show what's already tracked.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Filter by description (e.g. 'Netflix', 'rent'). Omit to detect all patterns."),
        months: z
          .number()
          .optional()
          .describe("Lookback period in months (default 6, max 12)"),
      }),
      execute: async ({ query, months = 6 }) => {
        const lookback = Math.min(months, 12);
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - lookback);

        let q = supabase
          .from("transactions")
          .select("description, amount_cents, created_at")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null)
          .gte("settled_at", startDate.toISOString())
          .order("created_at", { ascending: true });

        if (query) q = q.ilike("description", `%${escapeLikePattern(query)}%`);

        const { data: transactions, error } = await q;
        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        const detected = detectRecurringTransactions(
          (transactions || []) as Array<{ description: string; amount_cents: number; created_at: string }>
        );

        // Cross-reference with existing expense definitions
        const { data: existingExpenses } = await supabase
          .from("expense_definitions")
          .select("id, name, merchant_name, expected_amount_cents, recurrence_type")
          .eq("partnership_id", partnershipId!)
          .eq("is_active", true);

        const expenses = (existingExpenses || []) as Array<{
          id: string; name: string; merchant_name: string | null;
          expected_amount_cents: number; recurrence_type: string;
        }>;

        const patterns = detected.map((d) => {
          const match = expenses.find(
            (e) =>
              e.name.toLowerCase().includes(d.description.toLowerCase()) ||
              d.description.toLowerCase().includes(e.name.toLowerCase()) ||
              (e.merchant_name && d.description.toLowerCase().includes(e.merchant_name.toLowerCase()))
          );

          return {
            description: d.description,
            averageAmount: `$${(d.averageAmount / 100).toFixed(2)}`,
            averageAmountCents: d.averageAmount,
            frequency: d.frequency,
            nextExpectedDate: d.nextExpectedDate.toISOString().split("T")[0],
            count: d.count,
            emoji: d.emoji,
            alreadyTracked: !!match,
            existingExpenseId: match?.id || null,
            existingExpenseName: match?.name || null,
          };
        });

        return {
          patterns,
          totalDetected: patterns.length,
          alreadyTracked: patterns.filter((p) => p.alreadyTracked).length,
          untracked: patterns.filter((p) => !p.alreadyTracked).length,
        };
      },
    }),

    detectIncomePatterns: tool({
      description:
        "Detect income patterns from transaction history (salary, freelance, etc.). Call this BEFORE createIncomeSource to pre-fill from real data. Cross-references against existing income sources.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Filter by description (e.g. 'salary', 'freelance'). Omit to detect all income patterns."),
        months: z
          .number()
          .optional()
          .describe("Lookback period in months (default 6, max 12)"),
      }),
      execute: async ({ query, months = 6 }) => {
        const lookback = Math.min(months, 12);
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - lookback);

        let q = supabase
          .from("transactions")
          .select("id, description, amount_cents, created_at")
          .in("account_id", accountIds)
          .gt("amount_cents", 0)
          .gte("settled_at", startDate.toISOString())
          .order("created_at", { ascending: true });

        if (query) q = q.ilike("description", `%${escapeLikePattern(query)}%`);

        const { data: transactions, error } = await q;
        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Group by normalized description and run pattern detection per group
        const groups = new Map<string, Array<{ id: string; created_at: string; amount_cents: number; description: string }>>();
        for (const txn of (transactions || []) as Array<{ id: string; description: string; amount_cents: number; created_at: string }>) {
          const normalized = txn.description.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
          if (!groups.has(normalized)) groups.set(normalized, []);
          groups.get(normalized)!.push(txn);
        }

        // Cross-reference with existing income sources
        let incomeQuery = supabase
          .from("income_sources")
          .select("id, name, amount_cents, frequency, is_active")
          .eq("is_active", true);
        if (userId) incomeQuery = incomeQuery.eq("user_id", userId);

        const { data: existingSources } = await incomeQuery;
        const sources = (existingSources || []) as Array<{
          id: string; name: string; amount_cents: number; frequency: string; is_active: boolean;
        }>;

        const patterns: Array<Record<string, unknown>> = [];
        for (const [normalizedDesc, txns] of groups) {
          if (txns.length < 2) continue;

          const analysis = analyzeIncomePattern(txns);
          if (analysis.frequency === "unknown") continue;

          // Use the original (non-normalized) description from the most recent transaction
          const originalDesc = txns[txns.length - 1].description;

          const match = sources.find(
            (s) =>
              s.name.toLowerCase().includes(normalizedDesc) ||
              normalizedDesc.includes(s.name.toLowerCase())
          );

          patterns.push({
            description: originalDesc,
            frequency: analysis.frequency,
            averageAmount: `$${(analysis.averageAmountCents / 100).toFixed(2)}`,
            averageAmountCents: analysis.averageAmountCents,
            nextPredictedPayDate: analysis.nextPredictedPayDate,
            confidence: analysis.confidence,
            count: analysis.transactionCount,
            alreadyTracked: !!match,
            existingSourceId: match?.id || null,
            existingSourceName: match?.name || null,
          });
        }

        return {
          patterns,
          totalDetected: patterns.length,
          alreadyTracked: patterns.filter((p) => p.alreadyTracked).length,
          untracked: patterns.filter((p) => !p.alreadyTracked).length,
        };
      },
    }),

    // ============================================================
    // WRITE/ACTION TOOLS
    // ============================================================

    createBudget: tool({
      description:
        "Create a new budget with name, type, period, and methodology. Seeds all category rows automatically. ALWAYS confirm with the user before executing. ALWAYS gather spending data first (getSpendingSummary + getIncomeSummary) so you can suggest informed amounts.",
      inputSchema: z.object({
        name: z.string().describe("Budget name (e.g. 'Weekly Essentials', 'Household Budget')"),
        budgetType: z
          .enum(["personal", "household", "custom"])
          .describe("Budget type: personal (individual), household (shared with partner), custom (flexible)"),
        emoji: z.string().optional().describe("Emoji icon (default '💰')"),
        methodology: z
          .string()
          .optional()
          .describe("Budgeting method (default 'zero-based'). Options: 'zero-based', '50-30-20', 'envelope', 'pay-yourself-first'"),
        periodType: z
          .enum(["weekly", "fortnightly", "monthly"])
          .optional()
          .describe("Budget period (default 'monthly')"),
        budgetView: z
          .enum(["individual", "shared"])
          .optional()
          .describe("Budget view. Defaults: personal→individual, household→shared, custom→shared"),
        categoryFilter: z
          .object({ included: z.array(z.string()) })
          .optional()
          .describe("Parent categories to include (omit for all categories)"),
        totalBudget: z
          .number()
          .optional()
          .describe("Optional total budget cap in dollars"),
      }),
      execute: async ({ name, budgetType, emoji, methodology, periodType, budgetView, categoryFilter, totalBudget }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!partnershipId) return { error: "No partnership configured" };

        const resolvedPeriodType = periodType || "monthly";
        const resolvedBudgetView = budgetView || (budgetType === "personal" ? "individual" : "shared");
        const resolvedMethodology = methodology || "zero-based";
        const resolvedEmoji = emoji || "💰";

        const { data: existingBudgets } = await supabase
          .from("user_budgets")
          .select("id")
          .eq("partnership_id", partnershipId)
          .eq("is_active", true);
        const isFirst = !existingBudgets || existingBudgets.length === 0;

        const budgetRow = {
          partnership_id: partnershipId,
          name,
          emoji: resolvedEmoji,
          budget_type: budgetType,
          methodology: resolvedMethodology,
          budget_view: resolvedBudgetView,
          period_type: resolvedPeriodType,
          is_default: isFirst,
          is_active: true,
          carryover_mode: "none",
          total_budget: totalBudget ? Math.round(totalBudget * 100) : null,
          created_by: userId || null,
        };

        const { data: budget, error } = await insertBudgetWithSlugRetry(
          supabase as any,
          budgetRow,
          partnershipId,
          name
        );

        if (error) return { error: safeErrorMessage(error as any, "Database operation failed") };

        const budgetId = (budget as Record<string, unknown>).id as string;

        try {
          const currentMonth = new Date();
          currentMonth.setDate(1);
          const monthStr = currentMonth.toISOString().split("T")[0];

          const parentCategories = categoryFilter?.included?.length
            ? categoryFilter.included
            : [...ALL_PARENT_CATEGORIES];

          const subcategories = getSubcategoriesForParents(parentCategories);

          const categoryRows = subcategories.map((sub) => ({
            partnership_id: partnershipId,
            month: monthStr,
            assignment_type: "category",
            category_name: sub.parent,
            subcategory_name: sub.child,
            assigned_cents: 0,
            budget_view: resolvedBudgetView,
            stored_period_type: resolvedPeriodType,
            budget_id: budgetId,
            created_by: userId || null,
          }));

          const { data: goals } = await supabase
            .from("savings_goals")
            .select("id")
            .eq("partnership_id", partnershipId)
            .eq("is_completed", false);

          const goalRows = (goals || []).map((g: Record<string, unknown>) => ({
            partnership_id: partnershipId,
            month: monthStr,
            assignment_type: "goal",
            category_name: "",
            goal_id: (g as { id: string }).id,
            assigned_cents: 0,
            budget_view: resolvedBudgetView,
            stored_period_type: resolvedPeriodType,
            budget_id: budgetId,
            created_by: userId || null,
          }));

          const { data: investments } = await supabase
            .from("investments")
            .select("id")
            .eq("partnership_id", partnershipId);

          const investmentRows = (investments || []).map((i: Record<string, unknown>) => ({
            partnership_id: partnershipId,
            month: monthStr,
            assignment_type: "asset",
            category_name: "",
            asset_id: (i as { id: string }).id,
            assigned_cents: 0,
            budget_view: resolvedBudgetView,
            stored_period_type: resolvedPeriodType,
            budget_id: budgetId,
            created_by: userId || null,
          }));

          const allRows = [...categoryRows, ...goalRows, ...investmentRows];

          if (allRows.length > 0) {
            const { error: seedError } = await supabase
              .from("budget_assignments")
              .insert(allRows);

            if (seedError) throw seedError;
          }

          return {
            success: true,
            id: budgetId,
            name,
            emoji: resolvedEmoji,
            budgetType,
            methodology: resolvedMethodology,
            periodType: resolvedPeriodType,
            budgetView: resolvedBudgetView,
            seededCategories: categoryRows.length,
            seededGoals: goalRows.length,
            seededInvestments: investmentRows.length,
            isDefault: isFirst,
          };
        } catch (seedErr) {
          await supabase.from("user_budgets").delete().eq("id", budgetId).eq("partnership_id", partnershipId);
          return { error: safeErrorMessage(seedErr, "Budget seeding failed") };
        }
      },
    }),

    createBudgetAssignment: tool({
      description:
        "Create or update a budget allocation for a category or subcategory in a given month. Supports multi-budget and individual/shared views. ALWAYS confirm with the user before executing this tool.",
      inputSchema: z.object({
        month: z
          .string()
          .describe("Month in YYYY-MM format (e.g. '2025-02')"),
        categoryName: z
          .string()
          .describe("The parent category name to budget for (use getCategoryList to find valid names)"),
        amountDollars: z
          .number()
          .describe("Budget amount in dollars (e.g. 600 for $600)"),
        subcategoryName: z
          .string()
          .optional()
          .describe("Subcategory name for subcategory-level budgeting (e.g. 'Groceries' within 'Food & Dining')"),
        budgetView: z
          .enum(["individual", "shared"])
          .optional()
          .describe("Which budget view (default: from user's default budget)"),
        budgetId: z
          .string()
          .optional()
          .describe("Target budget ID (default: user's default budget)"),
      }),
      inputExamples: [
        { input: { month: "2025-02", categoryName: "Food & Dining", amountDollars: 600, subcategoryName: "Groceries" } },
        { input: { month: "2025-02", categoryName: "Entertainment & Leisure", amountDollars: 200, subcategoryName: "Streaming" } },
      ],
      execute: async ({ month, categoryName, amountDollars, subcategoryName, budgetView, budgetId }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!partnershipId) return { error: "No partnership configured" };
        if (amountDollars < 0) return { error: "Amount cannot be negative" };
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Month must be in YYYY-MM format" };

        const amountCents = Math.round(amountDollars * 100);
        const monthDate = `${month}-01`;

        // Look up default budget if not specified
        if (!budgetId) {
          const { data: defaultBudget } = await supabase
            .from("user_budgets")
            .select("id, budget_view")
            .eq("partnership_id", partnershipId)
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle();
          if (defaultBudget) {
            budgetId = defaultBudget.id;
            budgetView = budgetView || defaultBudget.budget_view;
          }
        }
        budgetView = budgetView || "shared";

        // Build uniqueness query (mirrors assign/route.ts logic)
        let existingQuery = supabase
          .from("budget_assignments")
          .select("id")
          .eq("partnership_id", partnershipId)
          .eq("month", monthDate)
          .eq("assignment_type", "category")
          .eq("budget_view", budgetView)
          .eq("category_name", categoryName);

        if (budgetId) {
          existingQuery = existingQuery.eq("budget_id", budgetId);
        } else {
          existingQuery = existingQuery.is("budget_id", null);
        }

        if (subcategoryName) {
          existingQuery = existingQuery.eq("subcategory_name", subcategoryName);
        } else {
          existingQuery = existingQuery.is("subcategory_name", null);
        }

        const { data: existing } = await existingQuery.maybeSingle();

        let action: string;
        let error;

        if (existing) {
          const { error: updateError } = await supabase
            .from("budget_assignments")
            .update({
              assigned_cents: amountCents,
              stored_period_type: "monthly",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .eq("partnership_id", partnershipId);
          error = updateError;
          action = "updated";
        } else {
          const insertData: Record<string, string | number | null> = {
            partnership_id: partnershipId,
            month: monthDate,
            category_name: categoryName,
            subcategory_name: subcategoryName || null,
            assigned_cents: amountCents,
            assignment_type: "category",
            stored_period_type: "monthly",
            budget_view: budgetView,
          };
          if (budgetId) insertData.budget_id = budgetId;

          const { error: insertError } = await supabase
            .from("budget_assignments")
            .insert(insertData);

          // Handle race condition: unique constraint violation → retry as update
          if (insertError?.code === "23505") {
            const { data: retryExisting } = await existingQuery.maybeSingle();
            if (retryExisting) {
              const { error: retryError } = await supabase
                .from("budget_assignments")
                .update({
                  assigned_cents: amountCents,
                  stored_period_type: "monthly",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", retryExisting.id)
                .eq("partnership_id", partnershipId);
              error = retryError;
            }
          } else {
            error = insertError;
          }
          action = "created";
        }

        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Atomically update budget_months total via RPC
        const { error: rpcError } = await supabase.rpc("update_budget_month_totals", {
          p_partnership_id: partnershipId,
          p_month: monthDate,
        });

        // Fallback if RPC not available
        if (rpcError) {
          let totalQuery = supabase
            .from("budget_assignments")
            .select("assigned_cents")
            .eq("partnership_id", partnershipId)
            .eq("month", monthDate);
          if (budgetId) {
            totalQuery = totalQuery.eq("budget_id", budgetId);
          } else {
            totalQuery = totalQuery.is("budget_id", null);
          }
          const { data: allAssignments } = await totalQuery;
          const totalAssigned = (allAssignments as Array<{ assigned_cents: number }> || [])
            .reduce((sum, a) => sum + a.assigned_cents, 0);

          const upsertData: Record<string, unknown> = {
            partnership_id: partnershipId,
            month: monthDate,
            assigned_total_cents: totalAssigned,
          };
          if (budgetId) upsertData.budget_id = budgetId;

          await supabase
            .from("budget_months")
            .upsert(upsertData, { onConflict: "partnership_id,month" });
        }

        // Get view-specific total for response
        let viewQuery = supabase
          .from("budget_assignments")
          .select("assigned_cents")
          .eq("partnership_id", partnershipId)
          .eq("month", monthDate)
          .eq("budget_view", budgetView);
        if (budgetId) {
          viewQuery = viewQuery.eq("budget_id", budgetId);
        } else {
          viewQuery = viewQuery.is("budget_id", null);
        }
        const { data: viewAssignments } = await viewQuery;
        const totalAssigned = (viewAssignments as Array<{ assigned_cents: number }> || [])
          .reduce((sum, a) => sum + a.assigned_cents, 0);

        return {
          success: true,
          category: categoryName,
          subcategory: subcategoryName || null,
          month,
          amount: `$${amountDollars.toFixed(2)}`,
          action,
          budgetView,
          totalMonthlyBudget: `$${(totalAssigned / 100).toFixed(2)}`,
        };
      },
    }),

    createExpenseDefinition: tool({
      description:
        "Create a new recurring bill or expense definition (e.g. Netflix, rent, electricity). ALWAYS confirm with the user before executing.",
      inputSchema: z.object({
        name: z.string().describe("Display name for the expense (e.g. 'Netflix', 'Rent')"),
        categoryName: z.string().describe("Category name (use getCategoryList to find valid names)"),
        amountDollars: z.number().describe("Expected amount in dollars"),
        recurrenceType: z
          .enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly", "one-time"])
          .describe("How often this expense recurs"),
        nextDueDate: z.string().describe("Next due date in YYYY-MM-DD format"),
        merchantName: z.string().optional().describe("Merchant name for auto-matching transactions"),
        matchPattern: z.string().optional().describe("Text pattern to match in transaction descriptions"),
        emoji: z.string().optional().describe("Emoji icon (e.g. '🎬', '🏠')"),
        notes: z.string().optional().describe("Optional notes"),
      }),
      inputExamples: [
        { input: { name: "Netflix", categoryName: "Entertainment", amountDollars: 22.99, recurrenceType: "monthly", nextDueDate: "2025-03-15", merchantName: "Netflix", emoji: "🎬" } },
        { input: { name: "Rent", categoryName: "Housing", amountDollars: 2000, recurrenceType: "monthly", nextDueDate: "2025-03-01", emoji: "🏠" } },
      ],
      execute: async ({ name, categoryName, amountDollars, recurrenceType, nextDueDate, merchantName, matchPattern, emoji, notes }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!partnershipId) return { error: "No partnership configured" };
        if (amountDollars <= 0) return { error: "Amount must be positive" };

        // Hard duplicate check
        const dupQuery = supabase
          .from("expense_definitions")
          .select("id, name, expected_amount_cents, recurrence_type")
          .eq("partnership_id", partnershipId)
          .eq("is_active", true)
          .ilike("name", `%${escapeLikePattern(name)}%`);
        const { data: duplicates } = await dupQuery;
        const dups = (duplicates || []) as Array<{ id: string; name: string; expected_amount_cents: number; recurrence_type: string }>;

        if (merchantName && dups.length === 0) {
          const { data: merchantDups } = await supabase
            .from("expense_definitions")
            .select("id, name, expected_amount_cents, recurrence_type")
            .eq("partnership_id", partnershipId)
            .eq("is_active", true)
            .ilike("merchant_name", `%${escapeLikePattern(merchantName)}%`);
          if (merchantDups && merchantDups.length > 0) {
            dups.push(...(merchantDups as typeof dups));
          }
        }

        if (dups.length > 0) {
          const existing = dups[0];
          return {
            error: `Expense "${existing.name}" already exists ($${(existing.expected_amount_cents / 100).toFixed(2)}/${existing.recurrence_type}). Use a different name or update the existing one.`,
            existingId: existing.id,
            existingName: existing.name,
            existingAmount: `$${(existing.expected_amount_cents / 100).toFixed(2)}`,
          };
        }

        const { data, error } = await supabase
          .from("expense_definitions")
          .insert({
            partnership_id: partnershipId,
            name,
            category_name: categoryName,
            expected_amount_cents: Math.round(amountDollars * 100),
            recurrence_type: recurrenceType,
            next_due_date: nextDueDate,
            merchant_name: merchantName || null,
            match_pattern: matchPattern || merchantName || null,
            emoji: emoji || inferExpenseEmoji(name, categoryName),
            notes: notes || null,
            is_active: true,
          })
          .select("id")
          .single();

        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        return {
          success: true,
          id: data.id,
          name,
          amount: `$${amountDollars.toFixed(2)}`,
          recurrence: recurrenceType,
          nextDue: nextDueDate,
          category: categoryName,
        };
      },
    }),

    createSavingsGoal: tool({
      description:
        "Create a new savings goal. ALWAYS confirm with the user before executing.",
      inputSchema: z.object({
        name: z.string().describe("Goal name (e.g. 'Holiday Fund', 'Emergency Fund')"),
        targetAmountDollars: z.number().describe("Target amount in dollars"),
        currentAmountDollars: z.number().optional().describe("Starting amount already saved (default 0)"),
        deadline: z.string().optional().describe("Target date in YYYY-MM-DD format"),
        icon: z.string().optional().describe("Emoji icon (e.g. '🏖️', '🚗')"),
        color: z.string().optional().describe("Color hex code (e.g. '#3B82F6')"),
      }),
      inputExamples: [
        { input: { name: "Holiday Fund", targetAmountDollars: 5000, deadline: "2025-12-01", icon: "🏖️" } },
        { input: { name: "Emergency Fund", targetAmountDollars: 10000, currentAmountDollars: 2500 } },
      ],
      execute: async ({ name, targetAmountDollars, currentAmountDollars = 0, deadline, icon, color }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!partnershipId) return { error: "No partnership configured" };
        if (targetAmountDollars <= 0) return { error: "Target amount must be positive" };

        // Hard duplicate check
        const { data: existingGoals } = await supabase
          .from("savings_goals")
          .select("id, name, target_amount_cents, current_amount_cents")
          .eq("partnership_id", partnershipId)
          .eq("is_completed", false)
          .ilike("name", `%${escapeLikePattern(name)}%`);
        const goalList = (existingGoals || []) as Array<{ id: string; name: string; target_amount_cents: number; current_amount_cents: number }>;

        if (goalList.length > 0) {
          const existing = goalList[0];
          return {
            error: `Savings goal "${existing.name}" already exists ($${(existing.current_amount_cents / 100).toFixed(2)} of $${(existing.target_amount_cents / 100).toFixed(2)}). Use a different name or update the existing one.`,
            existingId: existing.id,
            existingName: existing.name,
          };
        }

        const { data, error } = await supabase
          .from("savings_goals")
          .insert({
            partnership_id: partnershipId,
            name,
            target_amount_cents: Math.round(targetAmountDollars * 100),
            current_amount_cents: Math.round(currentAmountDollars * 100),
            deadline: deadline || null,
            icon: icon || null,
            color: color || null,
            is_completed: false,
          })
          .select("id")
          .single();

        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Create initial contribution record if starting with funds
        if (currentAmountDollars > 0) {
          await supabase.from("goal_contributions").insert({
            goal_id: data.id,
            amount_cents: Math.round(currentAmountDollars * 100),
            balance_after_cents: Math.round(currentAmountDollars * 100),
            source: "initial",
          });
        }

        return {
          success: true,
          id: data.id,
          name,
          target: `$${targetAmountDollars.toFixed(2)}`,
          current: `$${currentAmountDollars.toFixed(2)}`,
          deadline: deadline || "No deadline",
        };
      },
    }),

    updateSavingsGoal: tool({
      description:
        "Add funds to or modify an existing savings goal. Looks up goal by name. ALWAYS confirm with the user before executing.",
      inputSchema: z.object({
        goalName: z.string().describe("Name of the savings goal to update"),
        addFundsDollars: z.number().optional().describe("Amount in dollars to add to current savings"),
        newTargetDollars: z.number().optional().describe("New target amount in dollars"),
        newDeadline: z.string().optional().describe("New deadline in YYYY-MM-DD format"),
      }),
      inputExamples: [
        { input: { goalName: "Holiday Fund", addFundsDollars: 500 } },
        { input: { goalName: "Emergency Fund", newTargetDollars: 15000, newDeadline: "2026-06-01" } },
      ],
      execute: async ({ goalName, addFundsDollars, newTargetDollars, newDeadline }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!partnershipId) return { error: "No partnership configured" };

        const { data: matches } = await supabase
          .from("savings_goals")
          .select("id, name, target_amount_cents, current_amount_cents, deadline")
          .eq("partnership_id", partnershipId)
          .ilike("name", `%${escapeLikePattern(goalName)}%`);

        const goalMatches = (matches || []) as Array<{
          id: string; name: string; target_amount_cents: number;
          current_amount_cents: number; deadline: string | null;
        }>;

        if (goalMatches.length === 0) {
          return { error: `No savings goal found matching '${goalName}'` };
        }
        if (goalMatches.length > 1) {
          return {
            error: `Multiple goals match "${goalName}": ${goalMatches.map(g => g.name).join(", ")}. Please be more specific.`,
          };
        }

        const goal = goalMatches[0];

        const updates: Record<string, unknown> = {};

        if (addFundsDollars && addFundsDollars > 0) {
          updates.current_amount_cents = goal.current_amount_cents + Math.round(addFundsDollars * 100);
        }
        if (newTargetDollars && newTargetDollars > 0) {
          updates.target_amount_cents = Math.round(newTargetDollars * 100);
        }
        if (newDeadline) {
          updates.deadline = newDeadline;
        }

        // Check if completed
        const newCurrent = (updates.current_amount_cents as number) || goal.current_amount_cents;
        const newTarget = (updates.target_amount_cents as number) || goal.target_amount_cents;
        if (newCurrent >= newTarget) {
          updates.is_completed = true;
          updates.completed_at = new Date().toISOString();
        }

        if (Object.keys(updates).length === 0) {
          return { error: "No updates specified" };
        }

        const { error } = await supabase
          .from("savings_goals")
          .update(updates)
          .eq("id", goal.id)
          .eq("partnership_id", partnershipId);

        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Record contribution if funds were added
        if (addFundsDollars && addFundsDollars > 0) {
          await supabase.from("goal_contributions").insert({
            goal_id: goal.id,
            amount_cents: Math.round(addFundsDollars * 100),
            balance_after_cents: newCurrent,
            source: "manual",
          });
        }

        return {
          success: true,
          name: goal.name,
          previousAmount: `$${(goal.current_amount_cents / 100).toFixed(2)}`,
          newAmount: `$${(newCurrent / 100).toFixed(2)}`,
          target: `$${(newTarget / 100).toFixed(2)}`,
          progress: `${((newCurrent / newTarget) * 100).toFixed(1)}%`,
          isCompleted: newCurrent >= newTarget,
          deadline: newDeadline || goal.deadline || "No deadline",
        };
      },
    }),

    recategorizeTransaction: tool({
      description:
        "Change the category of a transaction. Searches by description and optionally date. ALWAYS confirm with the user before executing.",
      inputSchema: z.object({
        transactionDescription: z.string().describe("Transaction description to search for"),
        transactionDate: z.string().optional().describe("Transaction date in YYYY-MM-DD to narrow search"),
        newCategoryId: z.string().describe("New category ID to assign (use getCategoryList to find valid IDs)"),
        notes: z.string().optional().describe("Optional note about why the category was changed"),
      }),
      inputExamples: [
        { input: { transactionDescription: "ALDI", newCategoryId: "groceries", notes: "ALDI is a grocery store" } },
      ],
      execute: async ({ transactionDescription, transactionDate, newCategoryId, notes }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        // Find the transaction
        let q = supabase
          .from("transactions")
          .select("id, description, amount_cents, category_id, settled_at")
          .in("account_id", accountIds)
          .ilike("description", `%${escapeLikePattern(transactionDescription)}%`)
          .order("settled_at", { ascending: false })
          .limit(1);

        if (transactionDate) {
          q = q.gte("settled_at", transactionDate).lte("settled_at", `${transactionDate}T23:59:59`);
        }

        const { data: transactions } = await q;
        const txns = transactions as Array<Record<string, unknown>> || [];

        if (txns.length === 0) {
          return { error: `No transaction found matching '${transactionDescription}'${transactionDate ? ` on ${transactionDate}` : ""}` };
        }

        const txn = txns[0];
        const txnId = txn.id as string;
        const oldCategory = txn.category_id as string;

        // Create or update override
        const { error: overrideError } = await supabase
          .from("transaction_category_overrides")
          .upsert({
            transaction_id: txnId,
            override_category_id: newCategoryId,
            original_category_id: oldCategory,
            notes: notes || null,
          }, { onConflict: "transaction_id" });

        if (overrideError) return { error: safeErrorMessage(overrideError, "Failed to save category override") };

        // Look up the parent category for the new category
        const { data: mappingData } = await supabase
          .from("category_mappings")
          .select("new_parent_name")
          .eq("up_category_id", newCategoryId)
          .limit(1);

        const categoryMappings = (mappingData || []) as Array<{ new_parent_name: string }>;

        // Update both category_id and parent_category_id
        const updateFields: Record<string, string> = { category_id: newCategoryId };
        if (categoryMappings.length > 0) {
          updateFields.parent_category_id = categoryMappings[0].new_parent_name
            .toLowerCase()
            .replace(/ & /g, "-and-")
            .replace(/ /g, "-");
        }

        const { error: updateError } = await supabase
          .from("transactions")
          .update(updateFields)
          .eq("id", txnId);

        if (updateError) return { error: safeErrorMessage(updateError, "Failed to update transaction") };

        return {
          success: true,
          transaction: txn.description,
          amount: `$${(Math.abs(txn.amount_cents as number) / 100).toFixed(2)}`,
          date: txn.settled_at,
          previousCategory: oldCategory,
          newCategory: newCategoryId,
          newParentCategory: updateFields.parent_category_id || null,
        };
      },
    }),

    createIncomeSource: tool({
      description:
        "Add a new income source. Use 'recurring-salary' for regular paychecks (requires frequency), or 'one-off' for bonuses/gifts/etc (requires oneOffType). ALWAYS confirm with the user before executing.",
      inputSchema: z.object({
        name: z.string().describe("Income source name (e.g. 'Salary', 'Freelance Design')"),
        amountDollars: z.number().describe("Amount per period in dollars"),
        sourceType: z
          .enum(["recurring-salary", "one-off"])
          .describe("'recurring-salary' for regular income, 'one-off' for bonuses/gifts/etc"),
        frequency: z
          .enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly"])
          .optional()
          .describe("How often this income is received (required for recurring-salary, omit for one-off)"),
        oneOffType: z
          .enum(["bonus", "gift", "dividend", "tax-refund", "freelance", "other"])
          .optional()
          .describe("Sub-type for one-off income (required when sourceType is 'one-off')"),
        nextPayDate: z.string().optional().describe("Next expected payment date in YYYY-MM-DD"),
        notes: z.string().optional(),
      }),
      inputExamples: [
        { input: { name: "Salary", amountDollars: 5000, sourceType: "recurring-salary", frequency: "fortnightly", nextPayDate: "2025-02-14" } },
        { input: { name: "Tax Refund", amountDollars: 1200, sourceType: "one-off", oneOffType: "tax-refund" } },
      ],
      execute: async ({ name, amountDollars, sourceType, frequency, oneOffType, nextPayDate, notes }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!userId) return { error: "User not authenticated" };
        if (amountDollars <= 0) return { error: "Amount must be positive" };

        // Hard duplicate check
        const { data: existingIncome } = await supabase
          .from("income_sources")
          .select("id, name, amount_cents, frequency")
          .eq("user_id", userId!)
          .eq("is_active", true)
          .ilike("name", `%${escapeLikePattern(name)}%`);
        const existingList = (existingIncome || []) as Array<{ id: string; name: string; amount_cents: number; frequency: string }>;

        if (existingList.length > 0) {
          const existing = existingList[0];
          return {
            error: `Income source "${existing.name}" already exists ($${(existing.amount_cents / 100).toFixed(2)}/${existing.frequency}). Use a different name or update the existing one.`,
            existingId: existing.id,
            existingName: existing.name,
          };
        }

        if (sourceType === "recurring-salary" && !frequency) {
          return { error: "frequency is required for recurring-salary income" };
        }
        if (sourceType === "one-off" && !oneOffType) {
          return { error: "oneOffType is required for one-off income" };
        }

        const insertData: Record<string, unknown> = {
          user_id: userId,
          name,
          source_type: sourceType,
          amount_cents: Math.round(amountDollars * 100),
          frequency: frequency || null,
          one_off_type: oneOffType || null,
          next_pay_date: nextPayDate || null,
          match_pattern: name,
          is_active: true,
          notes: notes || null,
        };

        if (partnershipId) {
          insertData.partnership_id = partnershipId;
        }

        const { data, error } = await supabase
          .from("income_sources")
          .insert(insertData)
          .select("id")
          .single();

        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Calculate monthly equivalent
        let monthly = amountDollars;
        switch (frequency) {
          case "weekly": monthly = amountDollars * 52 / 12; break;
          case "fortnightly": monthly = amountDollars * 26 / 12; break;
          case "quarterly": monthly = amountDollars / 3; break;
          case "yearly": monthly = amountDollars / 12; break;
        }

        return {
          success: true,
          id: data.id,
          name,
          amount: `$${amountDollars.toFixed(2)}`,
          frequency,
          monthlyEquivalent: `$${monthly.toFixed(2)}`,
          nextPayDate: nextPayDate || "Not set",
        };
      },
    }),

    createInvestment: tool({
      description:
        "Add a new investment to the user's portfolio (stocks, ETFs, crypto, property, etc.). ALWAYS confirm with the user before executing. Creates an initial history entry for tracking.",
      inputSchema: z.object({
        assetType: z
          .enum(["stock", "etf", "crypto", "property", "other"])
          .describe("Type of investment asset"),
        name: z.string().describe("Investment name (e.g. 'VDHG', 'Bitcoin', 'Investment Property')"),
        tickerSymbol: z.string().optional().describe("Ticker symbol if applicable (e.g. 'VDHG.AX')"),
        quantity: z.number().optional().describe("Number of units/shares held"),
        purchaseValueDollars: z.number().optional().describe("Total purchase cost in dollars"),
        currentValueDollars: z.number().describe("Current total value in dollars"),
        notes: z.string().optional(),
      }),
      inputExamples: [
        { input: { assetType: "etf", name: "VDHG", tickerSymbol: "VDHG.AX", quantity: 100, purchaseValueDollars: 5500, currentValueDollars: 6200 } },
        { input: { assetType: "crypto", name: "Bitcoin", currentValueDollars: 15000 } },
      ],
      execute: async ({ assetType, name, tickerSymbol, quantity, purchaseValueDollars, currentValueDollars, notes }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!partnershipId) return { error: "No partnership configured" };
        if (currentValueDollars < 0) return { error: "Current value must be non-negative" };

        // Hard duplicate check by name or ticker
        const { data: nameDups } = await supabase
          .from("investments")
          .select("id, name, asset_type, current_value_cents, ticker_symbol")
          .eq("partnership_id", partnershipId)
          .ilike("name", `%${escapeLikePattern(name)}%`);
        let dups = (nameDups || []) as Array<{ id: string; name: string; asset_type: string; current_value_cents: number; ticker_symbol: string | null }>;

        if (tickerSymbol && dups.length === 0) {
          const { data: tickerDups } = await supabase
            .from("investments")
            .select("id, name, asset_type, current_value_cents, ticker_symbol")
            .eq("partnership_id", partnershipId)
            .eq("ticker_symbol", tickerSymbol);
          if (tickerDups && tickerDups.length > 0) {
            dups = tickerDups as typeof dups;
          }
        }

        if (dups.length > 0) {
          const existing = dups[0];
          return {
            error: `Investment "${existing.name}" already exists (${existing.asset_type}, $${(existing.current_value_cents / 100).toFixed(2)}). Use updateInvestment to update its value.`,
            existingId: existing.id,
            existingName: existing.name,
          };
        }

        const { data: inv, error } = await supabase
          .from("investments")
          .insert({
            partnership_id: partnershipId,
            asset_type: assetType,
            name,
            ticker_symbol: tickerSymbol || null,
            quantity: quantity || null,
            purchase_value_cents: purchaseValueDollars ? Math.round(purchaseValueDollars * 100) : null,
            current_value_cents: Math.round(currentValueDollars * 100),
            notes: notes || null,
          })
          .select("id")
          .single();

        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Create initial history entry
        await supabase.from("investment_history").insert({
          investment_id: inv.id,
          value_cents: Math.round(currentValueDollars * 100),
          recorded_at: new Date().toISOString(),
        });

        return {
          success: true,
          id: inv.id,
          name,
          assetType,
          currentValue: `$${currentValueDollars.toFixed(2)}`,
          purchaseValue: purchaseValueDollars ? `$${purchaseValueDollars.toFixed(2)}` : "Not set",
        };
      },
    }),

    updateInvestment: tool({
      description:
        "Update an existing investment's value, quantity, or notes. Looks up by name (partial match). ALWAYS confirm with the user before executing. Records a history entry when value changes.",
      inputSchema: z.object({
        investmentName: z.string().describe("Name or partial name of the investment to update"),
        currentValueDollars: z.number().optional().describe("New current value in dollars"),
        quantity: z.number().optional().describe("New quantity/units"),
        purchaseValueDollars: z.number().optional().describe("Updated purchase cost in dollars"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      inputExamples: [
        { input: { investmentName: "VDHG", currentValueDollars: 6500 } },
        { input: { investmentName: "Bitcoin", currentValueDollars: 18000, notes: "Updated after rally" } },
      ],
      execute: async ({ investmentName, currentValueDollars, quantity, purchaseValueDollars, notes }) => {
        const writeError = checkWriteLimit(writeCounter);
        if (writeError) return { error: writeError };
        if (!partnershipId) return { error: "No partnership configured" };

        // Find investment by partial name match
        const { data: matches } = await supabase
          .from("investments")
          .select("id, name, current_value_cents, asset_type")
          .eq("partnership_id", partnershipId)
          .ilike("name", `%${escapeLikePattern(investmentName)}%`);

        if (!matches || matches.length === 0) {
          return { error: `No investment found matching "${investmentName}"` };
        }
        if (matches.length > 1) {
          return {
            error: `Multiple investments match "${investmentName}": ${matches.map(m => m.name).join(", ")}. Please be more specific.`,
          };
        }

        const inv = matches[0];
        const updates: Record<string, unknown> = {};
        if (currentValueDollars !== undefined) updates.current_value_cents = Math.round(currentValueDollars * 100);
        if (quantity !== undefined) updates.quantity = quantity;
        if (purchaseValueDollars !== undefined) updates.purchase_value_cents = Math.round(purchaseValueDollars * 100);
        if (notes !== undefined) updates.notes = notes;

        if (Object.keys(updates).length === 0) {
          return { error: "No fields to update" };
        }

        const { error } = await supabase
          .from("investments")
          .update(updates)
          .eq("id", inv.id)
          .eq("partnership_id", partnershipId);

        if (error) return { error: safeErrorMessage(error, "Database operation failed") };

        // Record history entry if value changed
        if (currentValueDollars !== undefined) {
          await supabase.from("investment_history").insert({
            investment_id: inv.id,
            value_cents: Math.round(currentValueDollars * 100),
            recorded_at: new Date().toISOString(),
          });
        }

        const previousValue = inv.current_value_cents;
        const newValue = currentValueDollars !== undefined ? Math.round(currentValueDollars * 100) : previousValue;
        const change = newValue - previousValue;

        return {
          success: true,
          name: inv.name,
          assetType: inv.asset_type,
          previousValue: `$${(previousValue / 100).toFixed(2)}`,
          currentValue: `$${(newValue / 100).toFixed(2)}`,
          change: change !== 0 ? `${change >= 0 ? "+" : ""}$${(change / 100).toFixed(2)}` : "No value change",
        };
      },
    }),

    // ============================================================
    // NEW TOOLS — Financial Health, Net Worth, Goals, Investments
    // ============================================================

    getFinancialHealth: tool({
      description:
        "Get a comprehensive financial health snapshot with metrics and actionable recommendations. Shows savings rate, emergency fund months, essential vs discretionary spending ratio, goals progress, bills payment rate, and net worth trend. Use when the user asks how they're doing financially, wants a health check, or needs advice on priorities.",
      inputSchema: z.object({
        months: z
          .number()
          .optional()
          .describe("Lookback months for calculations (default: 3)"),
      }),
      inputExamples: [
        { input: {} },
        { input: { months: 6 } },
      ],
      execute: async ({ months = 3 }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        const lookback = Math.min(months, 12);
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - lookback);

        // Run all queries in parallel
        const [
          { data: accounts },
          { data: transactions },
          { data: mappings },
          { data: netWorthSnapshots },
          { data: goals },
          { data: expenses },
          { data: incomeSources },
        ] = await Promise.all([
          supabase
            .from("accounts")
            .select("balance_cents, account_type")
            .in("id", accountIds),
          supabase
            .from("transactions")
            .select("amount_cents, category_id, parent_category_id, is_income, settled_at, transfer_account_id")
            .in("account_id", accountIds)
            .is("transfer_account_id", null)
            .gte("settled_at", startDate.toISOString()),
          supabase
            .from("category_mappings")
            .select("up_category_id, new_parent_name, new_child_name"),
          supabase
            .from("net_worth_snapshots")
            .select("snapshot_date, total_balance_cents")
            .eq("partnership_id", partnershipId)
            .order("snapshot_date", { ascending: false })
            .limit(12),
          supabase
            .from("savings_goals")
            .select("current_amount_cents, target_amount_cents, is_completed")
            .eq("partnership_id", partnershipId)
            .eq("is_completed", false),
          supabase
            .from("expense_definitions")
            .select("id, is_active, expense_matches(id)")
            .eq("partnership_id", partnershipId)
            .eq("is_active", true),
          supabase
            .from("income_sources")
            .select("amount_cents, frequency")
            .eq("partnership_id", partnershipId)
            .eq("is_active", true),
        ]);

        const accts = (accounts || []) as Array<Record<string, unknown>>;
        const txns = (transactions || []) as Array<Record<string, unknown>>;
        const maps = (mappings || []) as Array<{ up_category_id: string; new_parent_name: string; new_child_name: string }>;

        // Calculate balances
        const liquidBalance = accts
          .filter(a => a.account_type !== "HOME_LOAN")
          .reduce((s, a) => s + (a.balance_cents as number), 0);
        const homeLoanBalance = accts
          .filter(a => a.account_type === "HOME_LOAN")
          .reduce((s, a) => s + Math.abs(a.balance_cents as number), 0);

        // Calculate income and spending totals
        let totalIncome = 0;
        let totalSpending = 0;
        txns.forEach(t => {
          const amt = t.amount_cents as number;
          if (amt > 0) totalIncome += amt;
          else totalSpending += Math.abs(amt);
        });
        const monthlyIncome = Math.round(totalIncome / lookback);
        const monthlySpending = Math.round(totalSpending / lookback);

        // Classify spending
        const spendingTxns = txns
          .filter(t => (t.amount_cents as number) < 0)
          .map(t => ({
            amount_cents: t.amount_cents as number,
            category_id: t.category_id as string | null,
            parent_category_id: t.parent_category_id as string | null,
          }));
        const classification = classifySpending(spendingTxns, maps);
        const monthlyEssentials = Math.round(classification.essentialCents / lookback);

        // Goals summary
        const goalsList: GoalSummary[] = (goals || []).map((g: Record<string, unknown>) => ({
          current_amount_cents: g.current_amount_cents as number,
          target_amount_cents: g.target_amount_cents as number,
          is_completed: g.is_completed as boolean,
        }));

        // Bills payment rate
        const expenseList = (expenses || []) as Array<Record<string, unknown>>;
        const totalExpenses = expenseList.length;
        const matchedCount = expenseList.filter(e => {
          const matches = e.expense_matches;
          return Array.isArray(matches) && matches.length > 0;
        }).length;

        // Annual income from income_sources
        let annualIncome = 0;
        ((incomeSources || []) as Array<Record<string, unknown>>).forEach(s => {
          const amt = s.amount_cents as number;
          switch (s.frequency) {
            case "weekly": annualIncome += amt * 52; break;
            case "fortnightly": annualIncome += amt * 26; break;
            case "monthly": annualIncome += amt * 12; break;
            case "quarterly": annualIncome += amt * 4; break;
            case "yearly": annualIncome += amt; break;
          }
        });

        // Generate health metrics using existing pure functions
        const inputs: HealthMetricInputs = {
          netWorthSnapshots: (netWorthSnapshots || []) as Array<{ snapshot_date: string; total_balance_cents: number }>,
          monthlyIncomeCents: monthlyIncome,
          monthlySpendingCents: monthlySpending,
          previousSavingsRates: [], // simplified — would need historical data
          liquidBalanceCents: liquidBalance,
          monthlyEssentialsCents: monthlyEssentials,
          goals: goalsList,
          essentialCents: Math.round(classification.essentialCents / lookback),
          discretionaryCents: Math.round(classification.discretionaryCents / lookback),
          totalExpenseDefinitions: totalExpenses,
          matchedExpenseCount: matchedCount,
          homeLoanBalanceCents: homeLoanBalance,
          annualIncomeCents: annualIncome,
        };

        const healthMetrics = generateHealthMetrics(inputs);

        // Compute key values for recommendations
        const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlySpending) / monthlyIncome) * 100 : 0;
        const emergencyMonths = monthlyEssentials > 0 ? liquidBalance / monthlyEssentials : 0;
        const essentialRatio = monthlySpending > 0
          ? (classification.essentialCents / lookback / monthlySpending) * 100
          : 0;

        const recInputs: RecommendationInputs = {
          healthMetrics,
          emergencyFundMonths: emergencyMonths,
          savingsRatePercent: savingsRate,
          essentialRatioPercent: essentialRatio,
          superCapRoomCents: 0,
          rebalancingNeeded: false,
          goalsBehindCount: 0,
          unpaidBillsCount: totalExpenses - matchedCount,
          upcomingGoals: [],
          liquidBalanceCents: liquidBalance,
        };

        const recommendations = generatePriorityRecommendations(recInputs);

        return {
          metrics: healthMetrics.map(m => ({
            id: m.id,
            label: m.label,
            value: m.value,
            status: m.status,
            trend: m.trend,
            statusLabel: m.statusLabel,
          })),
          recommendations: recommendations.slice(0, 5).map(r => ({
            priority: r.priority,
            title: r.title,
            description: r.description,
            impact: r.impact,
          })),
          summary: {
            monthlyIncome: `$${(monthlyIncome / 100).toFixed(2)}`,
            monthlySpending: `$${(monthlySpending / 100).toFixed(2)}`,
            monthlySavings: `$${((monthlyIncome - monthlySpending) / 100).toFixed(2)}`,
            savingsRate: `${savingsRate.toFixed(1)}%`,
            emergencyFundMonths: parseFloat(emergencyMonths.toFixed(1)),
            essentialPercent: `${essentialRatio.toFixed(0)}%`,
            discretionaryPercent: `${(100 - essentialRatio).toFixed(0)}%`,
            billsPaymentRate: `${totalExpenses > 0 ? Math.round((matchedCount / totalExpenses) * 100) : 0}%`,
          },
        };
      },
    }),

    getNetWorthHistory: tool({
      description:
        "Get net worth trend over time. Shows current net worth, change over period, highest/lowest values, and trend direction. Use when the user asks about their net worth or wealth trajectory.",
      inputSchema: z.object({
        period: z
          .enum(["1M", "3M", "6M", "1Y", "ALL"])
          .optional()
          .describe("Time period for history (default: '6M')"),
      }),
      inputExamples: [
        { input: {} },
        { input: { period: "1Y" } },
      ],
      execute: async ({ period = "6M" }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        const limitMap: Record<string, number> = { "1M": 31, "3M": 90, "6M": 180, "1Y": 365, "ALL": 9999 };
        const daysBack = limitMap[period] || 180;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        let query = supabase
          .from("net_worth_snapshots")
          .select("snapshot_date, total_balance_cents")
          .eq("partnership_id", partnershipId)
          .order("snapshot_date", { ascending: true });

        if (period !== "ALL") {
          query = query.gte("snapshot_date", startDate.toISOString().split("T")[0]);
        }

        const { data: snapshots } = await query;
        const rows = (snapshots || []) as Array<{ snapshot_date: string; total_balance_cents: number }>;

        if (rows.length === 0) {
          return { dataPoints: [], message: "No net worth data available yet." };
        }

        const latest = rows[rows.length - 1];
        const earliest = rows[0];
        const change = latest.total_balance_cents - earliest.total_balance_cents;
        const changePercent = earliest.total_balance_cents !== 0
          ? (change / Math.abs(earliest.total_balance_cents)) * 100
          : 0;

        let highest = rows[0];
        let lowest = rows[0];
        for (const row of rows) {
          if (row.total_balance_cents > highest.total_balance_cents) highest = row;
          if (row.total_balance_cents < lowest.total_balance_cents) lowest = row;
        }

        // Sample data points (max ~15 for token efficiency)
        const step = Math.max(1, Math.floor(rows.length / 15));
        const sampled = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);

        return {
          period,
          latestNetWorth: `$${(latest.total_balance_cents / 100).toFixed(2)}`,
          latestDate: latest.snapshot_date,
          changeOverPeriod: `${change >= 0 ? "+" : ""}$${(change / 100).toFixed(2)}`,
          changePercent: `${change >= 0 ? "+" : ""}${changePercent.toFixed(1)}%`,
          highestValue: `$${(highest.total_balance_cents / 100).toFixed(2)}`,
          highestDate: highest.snapshot_date,
          lowestValue: `$${(lowest.total_balance_cents / 100).toFixed(2)}`,
          lowestDate: lowest.snapshot_date,
          trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
          dataPointCount: rows.length,
          dataPoints: sampled.map(s => ({
            date: s.snapshot_date,
            value: `$${(s.total_balance_cents / 100).toFixed(2)}`,
          })),
        };
      },
    }),

    getGoalDetails: tool({
      description:
        "Get detailed information about savings goals including status classification (on-track, behind, ahead, overdue), contribution history, linked account balance, and budget allocations. Use when the user asks about goal progress, whether they're on track, or wants detailed goal information.",
      inputSchema: z.object({
        goalName: z
          .string()
          .optional()
          .describe("Name of a specific goal (partial match). If omitted, returns info for all active goals."),
        includeContributions: z
          .boolean()
          .optional()
          .describe("Include recent contribution history (default: false)"),
      }),
      inputExamples: [
        { input: {} },
        { input: { goalName: "Holiday", includeContributions: true } },
      ],
      execute: async ({ goalName, includeContributions = false }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        // Fetch goals with linked account
        let goalQuery = supabase
          .from("savings_goals")
          .select("id, name, icon, color, target_amount_cents, current_amount_cents, deadline, is_completed, created_at, linked_account_id")
          .eq("partnership_id", partnershipId)
          .eq("is_completed", false)
          .order("created_at", { ascending: false });

        if (goalName) {
          goalQuery = goalQuery.ilike("name", `%${escapeLikePattern(goalName)}%`);
        }

        const { data: goalsData } = await goalQuery;
        const goalRows = (goalsData || []) as Array<Record<string, unknown>>;

        if (goalRows.length === 0) {
          return { goals: [], message: goalName ? `No active goal found matching '${goalName}'` : "No active goals" };
        }

        const goalIds = goalRows.map(g => g.id as string);

        // Fetch contributions, budget allocations, and linked accounts in parallel
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-01`;

        const [{ data: contributions }, { data: budgetAllocs }, { data: linkedAccounts }] = await Promise.all([
          includeContributions
            ? supabase
                .from("goal_contributions")
                .select("goal_id, amount_cents, balance_after_cents, source, created_at")
                .in("goal_id", goalIds)
                .order("created_at", { ascending: false })
                .limit(50)
            : Promise.resolve({ data: [] }),
          supabase
            .from("budget_assignments")
            .select("goal_id, assigned_cents")
            .eq("partnership_id", partnershipId)
            .eq("month", currentMonth)
            .eq("assignment_type", "goal")
            .in("goal_id", goalIds),
          supabase
            .from("accounts")
            .select("id, display_name, balance_cents")
            .in("id", goalRows.filter(g => g.linked_account_id).map(g => g.linked_account_id as string)),
        ]);

        const contribList = (contributions || []) as Array<Record<string, unknown>>;
        const allocMap = new Map<string, number>();
        ((budgetAllocs || []) as Array<Record<string, unknown>>).forEach(a => {
          allocMap.set(a.goal_id as string, a.assigned_cents as number);
        });
        const accountMap = new Map<string, { name: string; balance: number }>();
        ((linkedAccounts || []) as Array<Record<string, unknown>>).forEach(a => {
          accountMap.set(a.id as string, {
            name: a.display_name as string,
            balance: a.balance_cents as number,
          });
        });

        const goalsOutput = goalRows.map(g => {
          const goalId = g.id as string;
          const target = g.target_amount_cents as number;
          const current = g.current_amount_cents as number;
          const remaining = target - current;
          const progress = target > 0 ? (current / target) * 100 : 0;

          // Classify status using existing pure function
          const goalForCalc: GoalForCalculation = {
            id: goalId,
            name: g.name as string,
            icon: (g.icon as string) || "",
            color: (g.color as string) || "",
            current_amount_cents: current,
            target_amount_cents: target,
            deadline: g.deadline as string | null,
            is_completed: false,
            created_at: g.created_at as string,
          };

          const goalContribs: GoalContribution[] = contribList
            .filter(c => c.goal_id === goalId)
            .map(c => ({
              id: c.id as string || "",
              goal_id: goalId,
              amount_cents: c.amount_cents as number,
              balance_after_cents: c.balance_after_cents as number,
              source: c.source as GoalContribution["source"],
              created_at: c.created_at as string,
            }));

          const budgetAllocation = allocMap.get(goalId) || 0;
          const status = classifyGoalStatus(goalForCalc, goalContribs, budgetAllocation);

          // Linked account
          const linkedId = g.linked_account_id as string | null;
          const linkedAcct = linkedId ? accountMap.get(linkedId) : null;

          // Months remaining
          const deadline = g.deadline as string | null;
          let monthsRemaining: number | null = null;
          if (deadline) {
            const deadlineDate = new Date(deadline);
            monthsRemaining = Math.max(0,
              (deadlineDate.getFullYear() - today.getFullYear()) * 12 +
              (deadlineDate.getMonth() - today.getMonth())
            );
          }

          const result: Record<string, unknown> = {
            name: g.name,
            icon: g.icon,
            target: `$${(target / 100).toFixed(2)}`,
            current: `$${(current / 100).toFixed(2)}`,
            remaining: `$${(remaining / 100).toFixed(2)}`,
            progress: `${progress.toFixed(1)}%`,
            deadline: deadline || "No deadline",
            monthsRemaining,
            status: status.status,
            monthlySavingsNeeded: status.monthlySavingsNeeded > 0
              ? `$${(status.monthlySavingsNeeded / 100).toFixed(2)}/month`
              : "N/A",
            currentMonthlySavingsRate: status.currentMonthlySavingsRate > 0
              ? `$${(status.currentMonthlySavingsRate / 100).toFixed(2)}/month`
              : "No recent contributions",
            budgetAllocation: budgetAllocation > 0
              ? `$${(budgetAllocation / 100).toFixed(2)}/month`
              : "Not budgeted",
          };

          if (linkedAcct) {
            result.linkedAccount = {
              name: linkedAcct.name,
              balance: `$${(linkedAcct.balance / 100).toFixed(2)}`,
            };
          }

          if (includeContributions && goalContribs.length > 0) {
            result.recentContributions = goalContribs.slice(0, 10).map(c => ({
              date: c.created_at.substring(0, 10),
              amount: `$${(c.amount_cents / 100).toFixed(2)}`,
              source: c.source,
            }));
          }

          return result;
        });

        return { goals: goalsOutput };
      },
    }),

    getInvestmentPortfolio: tool({
      description:
        "Get investment portfolio summary including total value, performance metrics, top gainers/losers, and optional rebalancing suggestions. Use when the user asks about their investments or portfolio.",
      inputSchema: z.object({
        includeHistory: z
          .boolean()
          .optional()
          .describe("Include portfolio value history (default: false)"),
        period: z
          .enum(["1M", "3M", "6M", "1Y", "ALL"])
          .optional()
          .describe("History period if includeHistory is true (default: '3M')"),
      }),
      inputExamples: [
        { input: {} },
        { input: { includeHistory: true, period: "6M" } },
      ],
      execute: async ({ includeHistory = false, period = "3M" }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        // Fetch investments
        const { data: investments } = await supabase
          .from("investments")
          .select("id, name, ticker_symbol, asset_type, quantity, purchase_value_cents, current_value_cents, notes, created_at")
          .eq("partnership_id", partnershipId);

        const invRows = (investments || []) as Array<Record<string, unknown>>;

        if (invRows.length === 0) {
          return { investments: [], message: "No investments tracked yet." };
        }

        // Calculate performance metrics using existing pure functions
        const invForCalc = invRows.map(i => ({
          id: i.id as string,
          name: i.name as string,
          ticker_symbol: i.ticker_symbol as string | null,
          asset_type: i.asset_type as string,
          current_value_cents: i.current_value_cents as number,
          purchase_value_cents: (i.purchase_value_cents as number | null) || 0,
          created_at: i.created_at as string,
        }));

        const perfMetrics = calculatePerformanceMetrics(invForCalc);
        const topMovers = calculateTopMovers(invForCalc);

        const totalValue = invForCalc.reduce((s, i) => s + i.current_value_cents, 0);
        const totalCost = invForCalc.reduce((s, i) => s + i.purchase_value_cents, 0);
        const totalGain = totalValue - totalCost;

        // Check for rebalancing targets
        const { data: targets } = await supabase
          .from("target_allocations")
          .select("asset_type, target_percentage")
          .eq("partnership_id", partnershipId);

        let rebalancing: Array<Record<string, unknown>> = [];
        if (targets && targets.length > 0) {
          // Build current allocation by asset type
          const byType = new Map<string, number>();
          invForCalc.forEach(i => {
            byType.set(i.asset_type, (byType.get(i.asset_type) || 0) + i.current_value_cents);
          });
          const currentAlloc = [...byType.entries()].map(([assetType, valueCents]) => ({ assetType, valueCents }));
          const deltas = calculateRebalancing(
            currentAlloc,
            targets as Array<{ asset_type: string; target_percentage: number }>,
            totalValue
          );
          rebalancing = deltas.map(d => ({
            assetType: d.assetType,
            currentPercent: `${d.currentPercent.toFixed(1)}%`,
            targetPercent: `${d.targetPercent.toFixed(1)}%`,
            action: d.isOverweight
              ? `Sell $${(Math.abs(d.deltaCents) / 100).toFixed(2)}`
              : `Buy $${(Math.abs(d.deltaCents) / 100).toFixed(2)}`,
          }));
        }

        const result: Record<string, unknown> = {
          totalValue: `$${(totalValue / 100).toFixed(2)}`,
          totalCost: `$${(totalCost / 100).toFixed(2)}`,
          totalGain: `${totalGain >= 0 ? "+" : ""}$${(totalGain / 100).toFixed(2)}`,
          totalROI: `${perfMetrics.totalROIPercent >= 0 ? "+" : ""}${perfMetrics.totalROIPercent.toFixed(1)}%`,
          investments: invForCalc.map(i => {
            const gain = i.current_value_cents - i.purchase_value_cents;
            const gainPct = i.purchase_value_cents > 0
              ? (gain / i.purchase_value_cents) * 100
              : 0;
            return {
              name: i.name,
              type: i.asset_type,
              ticker: i.ticker_symbol,
              currentValue: `$${(i.current_value_cents / 100).toFixed(2)}`,
              purchaseValue: `$${(i.purchase_value_cents / 100).toFixed(2)}`,
              gain: `${gain >= 0 ? "+" : ""}$${(gain / 100).toFixed(2)}`,
              gainPercent: `${gain >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`,
            };
          }),
          performance: {
            bestPerformer: perfMetrics.bestPerformer
              ? { name: perfMetrics.bestPerformer.name, gainPercent: `${perfMetrics.bestPerformer.gainPercent.toFixed(1)}%` }
              : null,
            worstPerformer: perfMetrics.worstPerformer
              ? { name: perfMetrics.worstPerformer.name, gainPercent: `${perfMetrics.worstPerformer.gainPercent.toFixed(1)}%` }
              : null,
          },
          topGainers: topMovers.gainers.slice(0, 3).map(m => ({
            name: m.name,
            gainPercent: `+${m.gainPercent.toFixed(1)}%`,
          })),
          topLosers: topMovers.losers.slice(0, 3).map(m => ({
            name: m.name,
            gainPercent: `${m.gainPercent.toFixed(1)}%`,
          })),
        };

        if (rebalancing.length > 0) {
          result.rebalancing = rebalancing;
        }

        // Portfolio history if requested
        if (includeHistory) {
          const limitMap: Record<string, number> = { "1M": 31, "3M": 90, "6M": 180, "1Y": 365, "ALL": 9999 };
          const daysBack = limitMap[period] || 90;
          const histStart = new Date();
          histStart.setDate(histStart.getDate() - daysBack);

          const { data: history } = await supabase
            .from("investment_history")
            .select("investment_id, value_cents, recorded_at")
            .in("investment_id", invForCalc.map(i => i.id))
            .gte("recorded_at", histStart.toISOString())
            .order("recorded_at", { ascending: true });

          if (history && history.length > 0) {
            const portfolioHistory = aggregatePortfolioHistory(
              invForCalc,
              history as Array<{ investment_id: string; value_cents: number; recorded_at: string }>,
              histStart,
              new Date()
            );

            // Sample to ~15 points
            const step = Math.max(1, Math.floor(portfolioHistory.length / 15));
            result.portfolioHistory = portfolioHistory
              .filter((_, i) => i % step === 0 || i === portfolioHistory.length - 1)
              .map(p => ({
                date: p.date,
                value: `$${(p.valueCents / 100).toFixed(2)}`,
              }));
          }
        }

        return result;
      },
    }),

    getFIREProgress: tool({
      description:
        "Get FIRE (Financial Independence, Retire Early) projections and progress. Shows current age, FIRE number, progress %, projected retirement date/age, years to FIRE, savings rate, two-bucket breakdown (super vs outside super), all four FIRE variants (lean/regular/fat/coast), recommendations, and a gameplan. Supports what-if scenarios for extra monthly savings. Use when the user asks about retirement, FIRE, financial independence, or 'when can I retire?'",
      inputSchema: z.object({
        extraMonthlySavingsDollars: z
          .number()
          .optional()
          .describe("Optional what-if: extra monthly savings in dollars to simulate (e.g. 500 for '$500 more per month')"),
      }),
      inputExamples: [
        { input: {} },
        { input: { extraMonthlySavingsDollars: 500 } },
      ],
      execute: async ({ extraMonthlySavingsDollars }) => {
        if (!partnershipId) return { error: "No partnership configured" };

        // Fetch FIRE profile from profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select(
            "date_of_birth, target_retirement_age, super_balance_cents, super_contribution_rate, expected_return_rate, outside_super_return_rate, income_growth_rate, spending_growth_rate, fire_variant, annual_expense_override_cents, fire_onboarded"
          )
          .eq("id", userId!)
          .maybeSingle();

        if (!profile || !profile.fire_onboarded || !profile.date_of_birth) {
          return {
            error: "FIRE is not set up yet. The user needs to complete FIRE onboarding in the Plan tab first (set date of birth, super balance, and retirement preferences).",
          };
        }

        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Parallel queries: transactions (12mo), category_mappings, investments, income_sources
        const [
          { data: txns },
          { data: mappings },
          { data: investments },
          { data: incomeSources },
        ] = await Promise.all([
          supabase
            .from("transactions")
            .select("amount_cents, category_id, parent_category_id, is_income, is_internal_transfer, created_at")
            .in("account_id", accountIds.length > 0 ? accountIds : ["__none__"])
            .is("transfer_account_id", null)
            .gte("created_at", twelveMonthsAgo.toISOString())
            .lte("created_at", endOfMonth.toISOString()),
          supabase
            .from("category_mappings")
            .select("up_category_id, new_parent_name, new_child_name"),
          supabase
            .from("investments")
            .select("current_value_cents, asset_type")
            .eq("partnership_id", partnershipId),
          supabase
            .from("income_sources")
            .select("amount_cents, frequency")
            .eq("user_id", userId!)
            .eq("is_active", true)
            .eq("source_type", "recurring-salary")
            .eq("is_manual_partner_income", false),
        ]);

        const allTxns = txns || [];
        const allMappings = mappings || [];

        // Classify spending
        const { essentialCents, discretionaryCents } = classifySpending(allTxns, allMappings);

        // Monthly averages (12 months)
        const monthCount = Math.max(1, Math.min(12, Math.ceil(
          (endOfMonth.getTime() - twelveMonthsAgo.getTime()) / (1000 * 60 * 60 * 24 * 30)
        )));

        const totalExpenseCents = allTxns
          .filter(t => t.amount_cents < 0 && !t.is_income && !t.is_internal_transfer)
          .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0);

        const totalIncomeCents = allTxns
          .filter(t => (t.amount_cents > 0 || t.is_income) && !t.is_internal_transfer)
          .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0);

        const monthlyEssentialsCents = Math.round(essentialCents / monthCount);
        const monthlyTotalSpendCents = Math.round(totalExpenseCents / monthCount);
        const txnMonthlyIncomeCents = Math.round(totalIncomeCents / monthCount);

        // Prefer income_sources over transaction averages
        const incomeSourceAnnual = (incomeSources || []).reduce((sum, src) => {
          const amount = src.amount_cents || 0;
          switch (src.frequency) {
            case "weekly": return sum + amount * 52;
            case "fortnightly": return sum + amount * 26;
            case "monthly": return sum + amount * 12;
            case "annually": return sum + amount;
            default: return sum + amount * 12;
          }
        }, 0);
        const monthlyIncomeCents = incomeSourceAnnual > 0
          ? Math.round(incomeSourceAnnual / 12)
          : txnMonthlyIncomeCents;

        const savingsRate = monthlyIncomeCents > 0
          ? ((monthlyIncomeCents - monthlyTotalSpendCents) / monthlyIncomeCents) * 100
          : 0;

        // Top spending categories
        const categoryTotals = new Map<string, number>();
        for (const txn of allTxns) {
          if (txn.amount_cents >= 0 || txn.is_income || txn.is_internal_transfer) continue;
          const catId = txn.category_id || txn.parent_category_id;
          if (!catId) continue;
          const mapping = allMappings.find(m => m.up_category_id === catId);
          const name = mapping?.new_parent_name || "Other";
          categoryTotals.set(name, (categoryTotals.get(name) || 0) + Math.abs(txn.amount_cents));
        }
        const topCategories = [...categoryTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, total]) => ({ name, amountCents: Math.round(total / monthCount) }));

        // Build FIRE inputs
        const spending: SpendingData = {
          monthlyEssentialsCents,
          monthlyTotalSpendCents,
          monthlyIncomeCents,
          savingsRatePercent: Math.max(0, savingsRate),
          topCategories,
        };

        const outsideSuperCents = (investments || []).reduce(
          (sum, inv) => sum + (inv.current_value_cents || 0), 0
        );

        const investmentDataInput: InvestmentData = {
          outsideSuperCents,
          superBalanceCents: profile.super_balance_cents || 0,
        };

        const fireProfile: FireProfile = {
          dateOfBirth: new Date(profile.date_of_birth),
          targetRetirementAge: profile.target_retirement_age,
          superBalanceCents: profile.super_balance_cents || 0,
          superContributionRate: Number(profile.super_contribution_rate) || 11.5,
          expectedReturnRate: Number(profile.expected_return_rate) || 7.0,
          outsideSuperReturnRate: profile.outside_super_return_rate != null
            ? Number(profile.outside_super_return_rate) : null,
          incomeGrowthRate: Number(profile.income_growth_rate) || 0,
          spendingGrowthRate: Number(profile.spending_growth_rate) || 0,
          fireVariant: profile.fire_variant || "regular",
          annualExpenseOverrideCents: profile.annual_expense_override_cents,
        };

        const age = calculateAge(fireProfile.dateOfBirth, now);
        const fireResult = projectFireDate(fireProfile, spending, investmentDataInput);
        const recommendations = generateRecommendations(fireResult, spending, fireProfile, investmentDataInput);
        const gameplan = generateFireGameplan(fireResult, fireProfile, spending, investmentDataInput, age);

        // Build response
        const result: Record<string, unknown> = {
          currentAge: age,
          fireVariant: fireProfile.fireVariant,
          fireNumber: `$${(fireResult.fireNumberCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
          annualExpenses: `$${(fireResult.annualExpensesCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
          progressPercent: `${fireResult.progressPercent.toFixed(1)}%`,
          projectedFireDate: fireResult.projectedFireDate?.toISOString().split("T")[0] || "Not achievable with current trajectory",
          projectedFireAge: fireResult.projectedFireAge,
          yearsToFire: fireResult.yearsToFire,
          targetAge: fireResult.targetAge,
          savingsRate: `${savingsRate.toFixed(1)}%`,
          monthlyIncome: `$${(monthlyIncomeCents / 100).toFixed(2)}`,
          monthlySpending: `$${(monthlyTotalSpendCents / 100).toFixed(2)}`,
          monthlySavings: `$${((monthlyIncomeCents - monthlyTotalSpendCents) / 100).toFixed(2)}`,
          twoBucket: {
            outsideSuper: {
              target: `$${(fireResult.twoBucket.outsideSuperTargetCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
              current: `$${(fireResult.twoBucket.outsideSuperCurrentCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
              progress: `${fireResult.twoBucket.outsideSuperProgressPercent.toFixed(1)}%`,
            },
            superannuation: {
              target: `$${(fireResult.twoBucket.superTargetCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
              current: `$${(fireResult.twoBucket.superCurrentCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
              progress: `${fireResult.twoBucket.superProgressPercent.toFixed(1)}%`,
            },
          },
          variants: fireResult.variants.map(v => ({
            variant: v.variant,
            fireNumber: `$${(v.fireNumberCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`,
            projectedAge: v.projectedAge,
            progress: `${v.progressPercent.toFixed(1)}%`,
          })),
          recommendations: recommendations.slice(0, 3).map(r => ({
            type: r.type,
            priority: r.priority,
            title: r.title,
            description: r.description,
            impact: r.impact,
          })),
          gameplan: {
            status: gameplan.status,
            statusSummary: gameplan.statusSummary,
            actions: gameplan.actions.slice(0, 3).map(a => ({
              type: a.type,
              priority: a.priority,
              headline: a.headline,
              detail: a.detail,
              impactYears: a.impactYears,
            })),
            coastFire: {
              isAchieved: gameplan.coastFire.isAchieved,
              progress: `${gameplan.coastFire.progressPercent.toFixed(1)}%`,
              description: gameplan.coastFire.description,
            },
          },
          topSpendingCategories: topCategories.map(c => ({
            name: c.name,
            monthlyAverage: `$${(c.amountCents / 100).toFixed(2)}`,
          })),
        };

        // What-if scenario
        if (extraMonthlySavingsDollars && extraMonthlySavingsDollars > 0) {
          const impact = calculateSavingsImpact(
            fireResult,
            Math.round(extraMonthlySavingsDollars * 100),
            fireProfile,
            spending,
            investmentDataInput
          );
          result.whatIf = {
            extraMonthlySavings: `$${extraMonthlySavingsDollars.toFixed(2)}`,
            originalFireAge: impact.originalFireAge,
            newFireAge: impact.newFireAge,
            yearsSaved: impact.yearsSaved,
            newFireDate: impact.newFireDate?.toISOString().split("T")[0] || null,
          };
        }

        return result;
      },
    }),
  };

  // Wrap every tool's execute with QueryLimitError handling so the AI model
  // gets a clean "please summarize" message instead of an unhandled throw.
  for (const t of Object.values(tools)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolObj = t as any;
    const original = toolObj.execute;
    if (typeof original !== "function") continue;
    toolObj.execute = async (...args: unknown[]) => {
      try {
        return await original(...args);
      } catch (err) {
        if (err instanceof QueryLimitError) {
          return { error: err.message };
        }
        throw err; // re-throw non-query-limit errors
      }
    };
  }

  return tools;
}
