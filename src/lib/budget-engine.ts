// budget-engine.ts — Pure calculation engine for all budget math.
//
// Architecture:
// - Zero database access. Every piece of data is passed in via typed inputs,
//   and every result is returned as a plain value or object.
// - The primary consumer is `/api/budget/summary`, which fetches all required
//   data from Supabase and passes it into `calculateBudgetSummary`.
//
// Key exports:
// - `calculateBudgetSummary` — main orchestrator that computes income, budgeted,
//   spent, carryover, TBB, and builds the full row set for the UI.
// - `getBudgetPeriodRange` / `getNextPeriodDate` / `getPreviousPeriodDate` —
//   period boundary calculations (month-aligned weeks and fortnights).
// - `calculateIncome` / `calculateBudgeted` / `calculateSpent` — individual
//   aggregation functions, also usable standalone.
// - `countOccurrencesInPeriod` — anchor-based recurrence projection.
// - `convertToTargetPeriod` — frequency normalisation (weekly <-> monthly etc).
// - `calculateCarryover` — previous-period surplus calculation.
// - `resolveSplitPercentage` — partner split resolution for shared budgets.

// ─── Timezone-Aware Date Helpers ─────────────────────────────────────────────

/**
 * Default timezone for budget period calculations.
 * The app targets Australian users (AUD, en-AU, UP Bank), so we default to
 * Australia/Sydney which covers AEST (UTC+10) and AEDT (UTC+11).
 *
 * Without this, period boundaries use UTC midnight — a 10-11 hour offset from
 * the user's actual midnight. A transaction at 1am AEDT on March 1st would be
 * counted in February's budget because it's still Feb 28 in UTC.
 */
export const DEFAULT_BUDGET_TIMEZONE = "Australia/Sydney";

/**
 * Extract year, month (0-indexed), and day from a Date in a given IANA timezone.
 * Uses Intl.DateTimeFormat to reliably convert — handles DST transitions.
 */
export function getDateComponentsInTimezone(
  date: Date,
  timezone: string
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10) - 1; // 0-indexed
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  return { year, month, day };
}

/**
 * Get the UTC offset (in milliseconds) for a given timezone at a specific
 * instant. Positive = timezone is ahead of UTC (e.g. AEST = +36000000).
 */
function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const tzYear = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const tzMonth = parseInt(parts.find((p) => p.type === "month")!.value, 10) - 1;
  const tzDay = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  const tzHour = parseInt(parts.find((p) => p.type === "hour")!.value, 10) % 24;
  const tzMinute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  const tzSecond = parseInt(parts.find((p) => p.type === "second")!.value, 10);

  // Reconstruct what UTC time would give those wall-clock components
  const tzAsUtc = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
  return tzAsUtc - date.getTime();
}

/**
 * Create a Date representing midnight (start of day) in the given timezone
 * for a specific year/month/day. Returns a UTC Date whose absolute instant
 * equals 00:00:00.000 in that timezone.
 *
 * Example: midnightInTimezone(2026, 2, 1, "Australia/Sydney")
 *   → 2026-02-28T13:00:00.000Z (midnight March 1 AEDT = 1pm Feb 28 UTC)
 */
export function midnightInTimezone(
  year: number,
  month: number, // 0-indexed
  day: number,
  timezone: string
): Date {
  // Start with a guess: UTC midnight for these date components
  const guess = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  // Get the timezone offset at this instant
  const offset = getTimezoneOffsetMs(guess, timezone);
  // Midnight in timezone = UTC midnight minus offset
  // (if tz is UTC+11, midnight local = 13:00 previous day UTC)
  const result = new Date(guess.getTime() - offset);
  // Verify with a second pass (DST transitions can shift the offset)
  const offset2 = getTimezoneOffsetMs(result, timezone);
  if (offset2 !== offset) {
    return new Date(guess.getTime() - offset2);
  }
  return result;
}

// ─── Core Enums / Type Aliases ───────────────────────────────────────────────

export type PeriodType = "weekly" | "fortnightly" | "monthly";
export type CarryoverMode = "none";
export type BudgetView = "individual" | "shared";
export type SplitType =
  | "equal"
  | "custom"
  | "individual-owner"
  | "individual-partner";

// ─── Period Range ────────────────────────────────────────────────────────────

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface IncomeSourceInput {
  amount_cents: number;
  frequency: string;
  source_type: string;
  is_received?: boolean;
  received_date?: string | null;
  user_id: string;
  is_manual_partner_income?: boolean;
}

export interface AssignmentInput {
  category_name: string;
  subcategory_name?: string | null;
  assigned_cents: number;
  assignment_type: string;
  goal_id?: string | null;
  asset_id?: string | null;
}

export interface ExpenseDefInput {
  id: string;
  category_name: string;
  expected_amount_cents: number;
  recurrence_type: string;
  inferred_subcategory?: string | null;
  next_due_date?: string | null;
}

export interface SplitSettingInput {
  category_name?: string | null;
  expense_definition_id?: string | null;
  split_type: SplitType;
  owner_percentage?: number;
}

export interface TransactionInput {
  id: string;
  amount_cents: number;
  category_id: string | null;
  created_at: string;
  is_income?: boolean;
  split_override_percentage?: number | null;
  matched_expense_id?: string | null;
}

export interface CategoryMapping {
  up_category_id: string;
  new_parent_name: string;
  new_child_name: string;
}

export interface GoalInput {
  id: string;
  name: string;
  icon: string;
  target: number;
  currentAmount: number;
  linked_account_id?: string;
}

export interface AssetInput {
  id: string;
  name: string;
  assetType: string;
  currentValue: number;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface BudgetRow {
  id: string;
  type: "subcategory" | "goal" | "asset";
  name: string;
  parentCategory?: string;
  budgeted: number;
  spent: number;
  available: number;
  isExpenseDefault: boolean;
  isShared?: boolean;
  sharePercentage?: number;
}

export interface MethodologySection {
  name: string;
  percentage: number;
  target: number;
  budgeted: number;
  spent: number;
}

export interface BudgetSummary {
  income: number;
  budgeted: number;
  spent: number;
  carryover: number;
  tbb: number;
  rows: BudgetRow[];
  methodologySections?: MethodologySection[];
}

// ─── Composite Input ─────────────────────────────────────────────────────────

export interface BudgetSummaryInput {
  periodType: PeriodType;
  budgetView: BudgetView;
  carryoverMode: CarryoverMode;
  methodology: string;
  /** Total budget override in cents (e.g. 500000 = $5,000). Used instead of income when set. */
  totalBudget: number | null;
  userId: string;
  ownerUserId: string;
  periodRange: PeriodRange;
  incomeSources: IncomeSourceInput[];
  assignments: AssignmentInput[];
  transactions: TransactionInput[];
  expenseDefinitions: ExpenseDefInput[];
  splitSettings: SplitSettingInput[];
  categoryMappings: CategoryMapping[];
  carryoverFromPrevious: number;
  layoutSections?: { name: string; percentage?: number; itemIds: string[] }[];
  goals?: GoalInput[];
  assets?: AssetInput[];
  /** goal_id → cents contributed this period (from internal transfers to linked accounts) */
  goalContributions?: Map<string, number>;
  /** asset_id → cents contributed this period (from investment_contributions table) */
  assetContributions?: Map<string, number>;
  /** Subcategory keys ("Parent::Child") from layout config that should always have rows */
  layoutSubcategoryKeys?: string[];
}

// ─── Period Range Calculation ────────────────────────────────────────────────

/**
 * Given a date and period type, returns the start/end dates and a human-readable
 * label for that budget period.
 *
 * When a timezone is provided (default: Australia/Sydney), period boundaries
 * are aligned to midnight in that timezone rather than UTC midnight. This
 * ensures an Australian user's "March" budget starts at midnight AEST/AEDT,
 * not midnight UTC (which is 10-11am the next day locally).
 *
 * The returned start/end Dates are UTC instants suitable for database queries
 * (e.g. .gte("settled_at", start.toISOString())).
 *
 * Weekly periods are month-aligned: 1-7, 8-14, 15-21, 22-end.
 * Fortnightly periods are month-aligned: 1-14, 15-end.
 * Monthly periods span the full calendar month.
 */
export function getBudgetPeriodRange(
  date: Date,
  periodType: PeriodType,
  timezone: string = DEFAULT_BUDGET_TIMEZONE
): PeriodRange {
  // Extract what date it is in the user's timezone
  const { year, month, day } = getDateComponentsInTimezone(date, timezone);

  let start: Date;
  let end: Date;
  let label: string;

  // Helper: days in month (pure arithmetic, no timezone needed)
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  if (periodType === "weekly") {
    let startDay: number;
    if (day <= 7) startDay = 1;
    else if (day <= 14) startDay = 8;
    else if (day <= 21) startDay = 15;
    else startDay = 22;

    start = midnightInTimezone(year, month, startDay, timezone);

    if (startDay === 22) {
      // Last "week" extends to the end of the month (midnight of 1st of next month)
      end = new Date(midnightInTimezone(year, month + 1, 1, timezone).getTime() - 1);
    } else {
      const endDay = startDay + 6;
      end = new Date(midnightInTimezone(year, month, endDay + 1, timezone).getTime() - 1);
    }

    // Label: use the timezone-local date for display
    const startDate = new Date(Date.UTC(year, month, startDay));
    label = `Week of ${startDay} ${startDate.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}`;
  } else if (periodType === "fortnightly") {
    const startDay = day <= 14 ? 1 : 15;
    start = midnightInTimezone(year, month, startDay, timezone);

    if (startDay === 1) {
      end = new Date(midnightInTimezone(year, month, 15, timezone).getTime() - 1);
    } else {
      // Second fortnight extends to the end of the month
      end = new Date(midnightInTimezone(year, month + 1, 1, timezone).getTime() - 1);
    }

    const endDay = startDay === 1 ? 14 : daysInMonth;
    const startDate = new Date(Date.UTC(year, month, startDay));
    const endDate = new Date(Date.UTC(year, month, endDay));
    const startLabel = startDate.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const endLabel = endDate.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    label = `${startLabel} - ${endLabel}`;
  } else {
    // monthly
    start = midnightInTimezone(year, month, 1, timezone);
    end = new Date(midnightInTimezone(year, month + 1, 1, timezone).getTime() - 1);
    const displayDate = new Date(Date.UTC(year, month, 1));
    label = displayDate.toLocaleDateString("en-AU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return { start, end, label };
}

// ─── Period Conversion ─────────────────────────────────────────────────────

/**
 * Convert an amount in cents from one budget frequency to another.
 * Uses monthly as the intermediate normalisation step.
 * Returns a rounded integer (cents).
 */
export function convertToTargetPeriod(
  amountCents: number,
  fromFrequency: string,
  toFrequency: string
): number {
  if (fromFrequency === toFrequency) return amountCents;

  // Normalise to monthly first
  let monthly: number;
  switch (fromFrequency) {
    case "weekly":
      monthly = amountCents * 4;
      break;
    case "fortnightly":
      monthly = amountCents * 2;
      break;
    case "quarterly":
      monthly = amountCents / 3;
      break;
    case "yearly":
      monthly = amountCents / 12;
      break;
    case "monthly":
    default:
      monthly = amountCents;
      break;
  }

  // Convert from monthly to target
  switch (toFrequency) {
    case "weekly":
      return Math.round(monthly / 4);
    case "fortnightly":
      return Math.round(monthly / 2);
    case "quarterly":
      return Math.round(monthly * 3);
    case "yearly":
      return Math.round(monthly * 12);
    case "monthly":
    default:
      return Math.round(monthly);
  }
}

/**
 * Count how many times a recurring expense occurs within a specific period.
 *
 * Anchor-based algorithm:
 * - Uses `next_due_date` as an anchor point to project occurrence dates onto
 *   a recurrence grid. The anchor does NOT need to fall within the period.
 * - For weekly/fortnightly: steps the anchor backward or forward in fixed
 *   intervals (7d / 14d) to find the first occurrence >= periodStart, then
 *   counts forward until periodEnd.
 * - For monthly/quarterly/yearly: converts dates to absolute-month integers
 *   and uses modular arithmetic to snap to the recurrence grid, then checks
 *   each candidate date (clamping day-of-month for short months).
 * - For one-time: returns 1 if the anchor falls within the period, else 0.
 *
 * Returns the count of occurrences (multiply by expected_amount_cents for total).
 */
export function countOccurrencesInPeriod(
  nextDueDate: string,
  recurrenceType: string,
  periodStart: Date,
  periodEnd: Date,
): number {
  const anchor = new Date(nextDueDate);
  if (isNaN(anchor.getTime())) return 0;

  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();

  if (recurrenceType === "one-time") {
    const t = anchor.getTime();
    return t >= startMs && t <= endMs ? 1 : 0;
  }

  if (recurrenceType === "weekly" || recurrenceType === "fortnightly") {
    const intervalMs = recurrenceType === "weekly" ? 7 * 86400000 : 14 * 86400000;

    // Step anchor backward/forward to the first occurrence on or after periodStart
    let d = anchor.getTime();
    if (d > startMs) {
      const steps = Math.ceil((d - startMs) / intervalMs);
      d -= steps * intervalMs;
    }
    while (d < startMs) d += intervalMs;

    let count = 0;
    while (d <= endMs) {
      count++;
      d += intervalMs;
    }
    return count;
  }

  // Monthly, quarterly, yearly — use month-based stepping
  const monthInterval =
    recurrenceType === "quarterly" ? 3 :
    recurrenceType === "yearly" ? 12 : 1;

  const anchorDay = anchor.getUTCDate();
  const anchorMonth = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth();
  const startMonth = periodStart.getUTCFullYear() * 12 + periodStart.getUTCMonth();
  const endMonth = periodEnd.getUTCFullYear() * 12 + periodEnd.getUTCMonth();

  // Find the first occurrence month on or after startMonth
  let offset = startMonth - anchorMonth;
  // Snap to the recurrence grid
  if (offset < 0) {
    offset = 0;
  } else {
    const remainder = offset % monthInterval;
    if (remainder !== 0) offset += monthInterval - remainder;
  }

  let count = 0;
  for (let m = anchorMonth + offset; ; m += monthInterval) {
    if (m > endMonth) break;
    const year = Math.floor(m / 12);
    const month = m % 12;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(anchorDay, daysInMonth);
    const occDate = new Date(Date.UTC(year, month, day));
    if (occDate.getTime() >= startMs && occDate.getTime() <= endMs) {
      count++;
    }
  }
  return count;
}

// ─── Income Calculation ───────────────────────────────────────────────────

/**
 * Calculate total income for a budget period.
 *
 * - Recurring income is converted from its native frequency to the target period.
 * - One-off income is only included if it has been received within the period range.
 * - In "individual" view, partner income and manual partner income are excluded.
 * - In "shared" view, all income sources are included.
 */
export function calculateIncome(
  sources: IncomeSourceInput[],
  targetPeriod: PeriodType,
  budgetView: BudgetView,
  userId: string,
  periodRange: PeriodRange
): number {
  let total = 0;

  for (const source of sources) {
    if (budgetView === "individual") {
      if (source.user_id !== userId || source.is_manual_partner_income) continue;
    }

    if (source.source_type === "one-off") {
      if (!source.is_received || !source.received_date) continue;
      const receivedDate = new Date(source.received_date);
      if (receivedDate < periodRange.start || receivedDate > periodRange.end) continue;
      total += source.amount_cents;
    } else {
      total += convertToTargetPeriod(source.amount_cents, source.frequency, targetPeriod);
    }
  }

  return total;
}

// ─── Budgeted (Assigned) Calculation ─────────────────────────────────────────

/**
 * Calculate total budgeted amount for a period.
 *
 * 1. Sums all non-zero manual assignments (category, goal, asset).
 * 2. For subcategories with no manual assignment (assigned_cents === 0),
 *    falls back to the matching expense definition's expected amount,
 *    converted to the target period.
 * 3. In "individual" view, expense defaults are adjusted by the user's
 *    split percentage.
 */
export function calculateBudgeted(
  assignments: AssignmentInput[],
  expenses: ExpenseDefInput[],
  splits: SplitSettingInput[],
  targetPeriod: PeriodType,
  budgetView: BudgetView,
  userId: string,
  ownerUserId: string,
  periodRange?: { start: Date; end: Date },
): number {
  let total = 0;

  const assignedSubcategories = new Set<string>();

  for (const a of assignments) {
    if (a.assigned_cents > 0) {
      total += a.assigned_cents;
      if (a.subcategory_name) {
        assignedSubcategories.add(`${a.category_name}::${a.subcategory_name}`);
      }
    }
  }

  for (const exp of expenses) {
    if (!exp.inferred_subcategory) continue;
    const key = `${exp.category_name}::${exp.inferred_subcategory}`;
    if (assignedSubcategories.has(key)) continue;

    let amount: number;
    if (exp.next_due_date && periodRange) {
      const occurrences = countOccurrencesInPeriod(exp.next_due_date, exp.recurrence_type, periodRange.start, periodRange.end);
      amount = exp.expected_amount_cents * occurrences;
    } else {
      amount = convertToTargetPeriod(exp.expected_amount_cents, exp.recurrence_type, targetPeriod);
    }

    if (budgetView === "individual") {
      const split = splits.find((s) => s.expense_definition_id === exp.id);
      if (split) {
        const pct = resolveSplitPercentage(split, userId, ownerUserId);
        amount = Math.round(amount * pct / 100);
      }
    }

    total += amount;
  }

  return total;
}

// ─── Split Resolution ──────────────────────────────────────────────────────

/**
 * Given a split setting, determine what percentage a specific user is
 * responsible for. Returns a number 0-100.
 *
 * If no setting is provided, returns 100 (user pays the full amount).
 */
export function resolveSplitPercentage(
  setting:
    | Pick<SplitSettingInput, "split_type" | "owner_percentage">
    | undefined,
  userId: string,
  ownerUserId: string
): number {
  if (!setting) return 100;

  const isOwner = userId === ownerUserId;

  switch (setting.split_type) {
    case "equal":
      return 50;
    case "custom": {
      const ownerPct = setting.owner_percentage ?? 100;
      return isOwner ? ownerPct : 100 - ownerPct;
    }
    case "individual-owner":
      return isOwner ? 100 : 0;
    case "individual-partner":
      return isOwner ? 0 : 100;
    default:
      return 100;
  }
}

// ─── Spent Calculation ──────────────────────────────────────────────────────

/**
 * Calculate spent amounts per subcategory from transactions.
 * Returns Map<"parent::subcategory", amountInCents> where amounts are positive.
 *
 * - Only negative (expense) transactions are counted; income is ignored.
 * - Transactions with an unknown category_id (no mapping) are skipped.
 * - In "individual" view, amounts are adjusted by the user's split percentage.
 * - A per-transaction split_override_percentage takes priority over the
 *   category-level split setting.
 */
export function calculateSpent(
  transactions: TransactionInput[],
  categoryMappings: CategoryMapping[],
  splitSettings: SplitSettingInput[],
  budgetView: BudgetView,
  userId: string,
  ownerUserId: string
): Map<string, number> {
  const spentMap = new Map<string, number>();

  const catLookup = new Map<string, { parent: string; child: string }>();
  for (const m of categoryMappings) {
    catLookup.set(m.up_category_id, { parent: m.new_parent_name, child: m.new_child_name });
  }

  for (const txn of transactions) {
    if (txn.is_income || txn.amount_cents >= 0) continue;
    if (!txn.category_id) continue;

    const mapping = catLookup.get(txn.category_id);
    if (!mapping) continue;

    let amount = Math.abs(txn.amount_cents);

    if (budgetView === "individual") {
      if (txn.split_override_percentage != null) {
        amount = Math.round(amount * txn.split_override_percentage / 100);
      } else {
        // Try expense-level split first (by matched_expense_id), then category-level
        const split =
          (txn.matched_expense_id
            ? splitSettings.find((s) => s.expense_definition_id === txn.matched_expense_id)
            : undefined) ??
          splitSettings.find((s) => s.category_name === mapping.parent);
        if (split) {
          const pct = resolveSplitPercentage(split, userId, ownerUserId);
          amount = Math.round(amount * pct / 100);
        }
      }
    }

    const key = `${mapping.parent}::${mapping.child}`;
    spentMap.set(key, (spentMap.get(key) ?? 0) + amount);
  }

  return spentMap;
}

// ─── Full Budget Summary Orchestrator ─────────────────────────────────────────

/**
 * Calculate a complete budget summary for a given period.
 *
 * This is the top-level orchestrator that ties together all the individual
 * calculation functions: income, budgeted, spent, carryover, and row building.
 *
 * Row building logic:
 * - Assignments with assigned_cents > 0 create rows with their manual amount.
 * - Assignments with assigned_cents === 0 are "seeded" rows. If a matching
 *   expense default exists, the expense default takes over (isExpenseDefault=true).
 *   Otherwise the row appears with budgeted=0.
 * - Expense defaults create rows for subcategories that have no manual assignment.
 * - Transactions that don't match any assignment or expense default create
 *   budget=0 rows (unplanned spending).
 */
export function calculateBudgetSummary(input: BudgetSummaryInput): BudgetSummary {
  const {
    periodType,
    budgetView,
    totalBudget,
    userId,
    ownerUserId,
    periodRange,
    incomeSources,
    assignments,
    transactions,
    expenseDefinitions,
    splitSettings,
    categoryMappings,
    carryoverFromPrevious,
    layoutSections,
  } = input;

  // 1. Income
  const income =
    totalBudget != null
      ? totalBudget
      : calculateIncome(
          incomeSources,
          periodType,
          budgetView,
          userId,
          periodRange
        );

  // 2. Budgeted total
  const budgeted = calculateBudgeted(
    assignments,
    expenseDefinitions,
    splitSettings,
    periodType,
    budgetView,
    userId,
    ownerUserId,
    periodRange,
  );

  // 3. Spent per subcategory
  const spentMap = calculateSpent(
    transactions,
    categoryMappings,
    splitSettings,
    budgetView,
    userId,
    ownerUserId
  );

  // 4. Carryover
  const carryover = carryoverFromPrevious;

  // 5. TBB
  const tbb = income + carryover - budgeted;

  // 6. Total spent (subcategory transactions + goal/asset contributions)
  const spent = Array.from(spentMap.values()).reduce((a, b) => a + b, 0)
    + Array.from(input.goalContributions?.values() ?? []).reduce((a, b) => a + b, 0)
    + Array.from(input.assetContributions?.values() ?? []).reduce((a, b) => a + b, 0);

  // 7. Build rows
  //
  // Row-building pipeline — an 8-layer waterfall where each layer only creates
  // rows for keys not already claimed by a previous layer:
  //
  //   1. Assignment rows (subcategories) — manual amounts (assigned_cents > 0),
  //      or $0 assignments that defer to expense defaults.
  //   2. Goal rows from assignments — with real name resolution via goalLookup.
  //   3. Asset rows from assignments — with real name resolution via assetLookup.
  //   4. Default goal rows — from input.goals for goals with no assignment this
  //      period (budgeted=0).
  //   5. Default asset rows — from input.assets for assets with no assignment
  //      this period (budgeted=0).
  //   6. Expense-default rows — subcategories with a matching expense definition
  //      but no assignment at all.
  //   7. Unplanned spending rows — transactions in subcategories with no
  //      assignment or expense default (budgeted=0, spent > 0).
  //   8. Layout placeholder rows — subcategories referenced in layout config
  //      but with no data at all (all zeros, ensures UI slots are filled).
  //
  // Layers 1-3 are processed together in the assignment loop.
  // Layers 4-8 each have their own loop, guarded by `rowMap.has(key)`.
  const rowMap = new Map<string, BudgetRow>();

  // Track which subcategories have a positive manual assignment
  const manuallyAssigned = new Set<string>();
  for (const a of assignments) {
    if (a.assignment_type === "category" && a.subcategory_name) {
      if (a.assigned_cents > 0) {
        manuallyAssigned.add(`${a.category_name}::${a.subcategory_name}`);
      }
    }
  }

  // Build an expense-default lookup keyed by "parent::subcategory".
  // Multiple expense definitions can map to the same subcategory — their
  // calculated amounts are summed together.
  // Manual assignments take precedence: if a subcategory has assigned_cents > 0
  // (tracked in `manuallyAssigned`), it is excluded from this lookup entirely.
  // When an assignment exists with assigned_cents === 0, the expense default
  // takes over for that row (isExpenseDefault=true) — see the assignment
  // processing loop below.
  const expenseDefaultLookup = new Map<
    string,
    { amount: number; expense: ExpenseDefInput }
  >();
  for (const exp of expenseDefinitions) {
    if (!exp.inferred_subcategory) continue;
    const key = `${exp.category_name}::${exp.inferred_subcategory}`;
    if (manuallyAssigned.has(key)) continue; // manual assignment takes precedence

    // Calculate amount based on actual occurrences in this period
    let amount: number;
    if (exp.next_due_date) {
      const occurrences = countOccurrencesInPeriod(
        exp.next_due_date,
        exp.recurrence_type,
        periodRange.start,
        periodRange.end,
      );
      amount = exp.expected_amount_cents * occurrences;
    } else {
      // Fallback to static conversion if no due date available
      amount = convertToTargetPeriod(
        exp.expected_amount_cents,
        exp.recurrence_type,
        periodType,
      );
    }

    if (budgetView === "individual") {
      const split = splitSettings.find(
        (s) => s.expense_definition_id === exp.id
      );
      if (split) {
        const pct = resolveSplitPercentage(split, userId, ownerUserId);
        amount = Math.round((amount * pct) / 100);
      }
    }

    const existing = expenseDefaultLookup.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      expenseDefaultLookup.set(key, { amount, expense: exp });
    }
  }

  // Build goal/asset name lookups — used to resolve human-readable names for
  // assigned goal/asset rows (instead of displaying raw UUIDs in the UI).
  const goalLookup = new Map<string, GoalInput>();
  for (const g of input.goals ?? []) goalLookup.set(g.id, g);
  const assetLookup = new Map<string, AssetInput>();
  for (const a of input.assets ?? []) assetLookup.set(a.id, a);

  // Process assignment rows
  for (const a of assignments) {
    if (a.assignment_type === "category" && a.subcategory_name) {
      const key = `${a.category_name}::${a.subcategory_name}`;
      const spentAmount = spentMap.get(key) ?? 0;

      // If assigned_cents is 0 and an expense default exists, use the default
      const expDefault = expenseDefaultLookup.get(key);
      if (a.assigned_cents === 0 && expDefault) {
        rowMap.set(key, {
          id: key,
          type: "subcategory",
          name: a.subcategory_name,
          parentCategory: a.category_name,
          budgeted: expDefault.amount,
          spent: spentAmount,
          available: expDefault.amount - spentAmount,
          isExpenseDefault: true,
        });
      } else {
        rowMap.set(key, {
          id: key,
          type: "subcategory",
          name: a.subcategory_name,
          parentCategory: a.category_name,
          budgeted: a.assigned_cents,
          spent: spentAmount,
          available: a.assigned_cents - spentAmount,
          isExpenseDefault: false,
        });
      }
    } else if (a.assignment_type === "goal" && a.goal_id) {
      const key = `goal::${a.goal_id}`;
      const goal = goalLookup.get(a.goal_id);
      const goalSpent = input.goalContributions?.get(a.goal_id) ?? 0;
      rowMap.set(key, {
        id: key,
        type: "goal",
        name: goal?.name ?? a.goal_id,
        budgeted: a.assigned_cents,
        spent: goalSpent,
        available: a.assigned_cents - goalSpent,
        isExpenseDefault: false,
      });
    } else if (a.assignment_type === "asset" && a.asset_id) {
      const key = `asset::${a.asset_id}`;
      const asset = assetLookup.get(a.asset_id);
      const assetSpent = input.assetContributions?.get(a.asset_id) ?? 0;
      rowMap.set(key, {
        id: key,
        type: "asset",
        name: asset?.name ?? a.asset_id,
        budgeted: a.assigned_cents,
        spent: assetSpent,
        available: a.assigned_cents - assetSpent,
        isExpenseDefault: false,
      });
    }
  }

  // Add default rows for goals not represented by any assignment
  if (input.goals) {
    for (const goal of input.goals) {
      const key = `goal::${goal.id}`;
      if (rowMap.has(key)) continue;
      const goalSpent = input.goalContributions?.get(goal.id) ?? 0;
      rowMap.set(key, {
        id: key,
        type: "goal",
        name: goal.name,
        budgeted: 0,
        spent: goalSpent,
        available: -goalSpent,
        isExpenseDefault: false,
      });
    }
  }

  // Add default rows for assets not represented by any assignment
  if (input.assets) {
    for (const asset of input.assets) {
      const key = `asset::${asset.id}`;
      if (rowMap.has(key)) continue;
      const assetSpent = input.assetContributions?.get(asset.id) ?? 0;
      rowMap.set(key, {
        id: key,
        type: "asset",
        name: asset.name,
        budgeted: 0,
        spent: assetSpent,
        available: -assetSpent,
        isExpenseDefault: false,
      });
    }
  }

  // Add expense defaults for subcategories without any assignment row
  for (const [key, { amount }] of expenseDefaultLookup) {
    if (rowMap.has(key)) continue; // already handled above (either manual or $0 override)

    const [parent, child] = key.split("::");
    const spentAmount = spentMap.get(key) ?? 0;
    rowMap.set(key, {
      id: key,
      type: "subcategory",
      name: child,
      parentCategory: parent,
      budgeted: amount,
      spent: spentAmount,
      available: amount - spentAmount,
      isExpenseDefault: true,
    });
  }

  // Add rows for transactions that don't match any assignment or expense default
  for (const [key, spentAmount] of spentMap) {
    if (rowMap.has(key)) continue;

    const [parent, child] = key.split("::");
    rowMap.set(key, {
      id: key,
      type: "subcategory",
      name: child,
      parentCategory: parent,
      budgeted: 0,
      spent: spentAmount,
      available: -spentAmount,
      isExpenseDefault: false,
    });
  }

  // Add default rows for layout-referenced subcategories not yet in rowMap
  if (input.layoutSubcategoryKeys) {
    for (const key of input.layoutSubcategoryKeys) {
      if (rowMap.has(key)) continue;
      const [parent, child] = key.split("::");
      if (!parent || !child) continue;
      const spentAmount = spentMap.get(key) ?? 0;
      rowMap.set(key, {
        id: key,
        type: "subcategory",
        name: child,
        parentCategory: parent,
        budgeted: 0,
        spent: spentAmount,
        available: -spentAmount,
        isExpenseDefault: false,
      });
    }
  }

  const rows = Array.from(rowMap.values());

  // Build methodology sections if applicable
  let methodologySections: MethodologySection[] | undefined;
  if (layoutSections && layoutSections.length > 0) {
    methodologySections = layoutSections.map((section) => {
      const pct = section.percentage ?? 0;
      const ids = section.itemIds ?? [];
      const sectionRows = rows.filter((r) =>
        ids.includes(r.id)
      );
      const sectionBudgeted = sectionRows.reduce(
        (sum, r) => sum + r.budgeted,
        0
      );
      const sectionSpent = sectionRows.reduce(
        (sum, r) => sum + r.spent,
        0
      );
      return {
        name: section.name,
        percentage: pct,
        target: Math.round((income * pct) / 100),
        budgeted: sectionBudgeted,
        spent: sectionSpent,
      };
    });
  }

  return {
    income,
    budgeted,
    spent,
    carryover,
    tbb,
    rows,
    methodologySections,
  };
}

// ─── Carryover Calculation ─────────────────────────────────────────────────

export interface CarryoverInput {
  mode: CarryoverMode;
  prevIncome: number;
  prevCarryover: number;
  prevBudgeted: number;
  prevSpent: number;
}

/**
 * Calculate the carryover amount from the previous period into the current one.
 * Always returns 0 — every period starts fresh with no carryover.
 */
export function calculateCarryover(_input: CarryoverInput): number {
  return 0;
}

// ─── Period Navigation ──────────────────────────────────────────────────────

/**
 * Given a date within a budget period, return the start date of the NEXT period.
 * Returns a UTC instant representing midnight of the next period in the given timezone.
 *
 * Weekly periods are month-aligned: 1-7, 8-14, 15-21, 22-end.
 * Fortnightly periods are month-aligned: 1-14, 15-end.
 * Monthly periods advance to the 1st of the next month.
 */
export function getNextPeriodDate(
  date: Date,
  periodType: PeriodType,
  timezone: string = DEFAULT_BUDGET_TIMEZONE
): Date {
  const { year, month, day } = getDateComponentsInTimezone(date, timezone);

  if (periodType === "monthly") {
    return midnightInTimezone(year, month + 1, 1, timezone);
  }

  if (periodType === "fortnightly") {
    if (day <= 14) return midnightInTimezone(year, month, 15, timezone);
    return midnightInTimezone(year, month + 1, 1, timezone);
  }

  // weekly
  if (day <= 7) return midnightInTimezone(year, month, 8, timezone);
  if (day <= 14) return midnightInTimezone(year, month, 15, timezone);
  if (day <= 21) return midnightInTimezone(year, month, 22, timezone);
  return midnightInTimezone(year, month + 1, 1, timezone);
}

/**
 * Given a date within a budget period, return the start date of the PREVIOUS period.
 * Returns a UTC instant representing midnight of the previous period in the given timezone.
 *
 * Weekly periods are month-aligned: 1-7, 8-14, 15-21, 22-end.
 * Fortnightly periods are month-aligned: 1-14, 15-end.
 * Monthly periods go back to the 1st of the previous month.
 */
export function getPreviousPeriodDate(
  date: Date,
  periodType: PeriodType,
  timezone: string = DEFAULT_BUDGET_TIMEZONE
): Date {
  const { year, month, day } = getDateComponentsInTimezone(date, timezone);

  if (periodType === "monthly") {
    return midnightInTimezone(year, month - 1, 1, timezone);
  }

  if (periodType === "fortnightly") {
    if (day >= 15) return midnightInTimezone(year, month, 1, timezone);
    return midnightInTimezone(year, month - 1, 15, timezone);
  }

  // weekly
  if (day >= 22) return midnightInTimezone(year, month, 15, timezone);
  if (day >= 15) return midnightInTimezone(year, month, 8, timezone);
  if (day >= 8) return midnightInTimezone(year, month, 1, timezone);
  return midnightInTimezone(year, month - 1, 22, timezone);
}

/**
 * Return an ISO-style month key (YYYY-MM-01) for the month containing the given date.
 * Used as a stable cache/lookup key for budget periods within a month.
 *
 * When a timezone is provided, the month is determined by the date in that
 * timezone — not the UTC date. This ensures the month key matches the period
 * boundaries computed by getBudgetPeriodRange.
 */
export function getMonthKeyForPeriod(
  date: Date,
  timezone: string = DEFAULT_BUDGET_TIMEZONE
): string {
  const { year, month } = getDateComponentsInTimezone(date, timezone);
  const m = String(month + 1).padStart(2, "0");
  return `${year}-${m}-01`;
}
