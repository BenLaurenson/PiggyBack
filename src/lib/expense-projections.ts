/**
 * Expense Projection Utilities
 * Generate future expense occurrences and group into timeline buckets
 */

import { getCurrentDate } from "@/lib/demo-guard";

// Import from canonical location and re-export for backward compatibility
import type { ExpenseData } from '@/types/expense';
export type { ExpenseData } from '@/types/expense';

// Expense with all its matches for a period (used for instance generation)
export interface ExpenseMatch {
  id: string;
  for_period: string;
  matched_at: string;
  transaction_id: string;
  transactions?: {
    amount_cents: number;
    settled_at: string | null;
    created_at: string;
  };
}

export interface ExpenseWithMatches extends ExpenseData {
  expense_matches?: ExpenseMatch[];
}

// Individual paid instance (e.g., one week of a weekly expense)
export interface PaidExpenseInstance extends ExpenseData {
  instance_period: string;     // The specific for_period (e.g., "2026-01-06" for week of Jan 6)
  instance_label: string;      // Human-readable label (e.g., "9 Jan" for the actual payment date)
  instance_index: number;      // 0, 1, 2... for ordering
  transaction_id?: string;     // Unique identifier for the matched transaction
}

export interface ProjectedExpense extends ExpenseData {
  projectedDate: Date;
  occurrenceIndex: number; // 0 = current, 1+ = future projection
  isProjection: boolean;
}

export interface TimelineGroup {
  key: string;           // 'this-month' | 'next-month' | '2025-03'
  label: string;         // 'This Month' | 'February' etc.
  expenses: ProjectedExpense[];
  totalAmount: number;
  isPast: boolean;
}

// Condensed expense for grouping recurring items (e.g., "Gym x3")
export interface CondensedExpense extends ProjectedExpense {
  occurrenceCount: number;       // How many times this expense appears in the group
  condensedLabel: string;        // "Gym x3" or just "Gym" if count is 1
  totalAmountCents: number;      // Sum of all occurrences
  allOccurrences: ProjectedExpense[]; // Original expenses for drill-down
}

export interface CondensedTimelineGroup {
  key: string;
  label: string;
  expenses: CondensedExpense[];
  totalAmount: number;
  isPast: boolean;
}

/**
 * Generate projected future occurrences for a single expense
 */
export function generateProjectedOccurrences(
  expense: ExpenseData,
  monthsAhead: number = 1, // Only show This Month + Next Month by default
  referenceDate: Date = getCurrentDate()
): ProjectedExpense[] {
  const occurrences: ProjectedExpense[] = [];
  const startDate = new Date(expense.next_due_date);

  // Calculate end date - go to end of the "monthsAhead+1" month to capture all of "next month"
  // e.g., if monthsAhead=1 and it's Jan 9, we want to show through end of February
  const endDate = new Date(referenceDate);
  endDate.setMonth(endDate.getMonth() + monthsAhead + 2); // +2 to get to month after next
  endDate.setDate(0); // Set to last day of next month

  // Add the current occurrence (index 0)
  occurrences.push({
    ...expense,
    projectedDate: new Date(startDate),
    occurrenceIndex: 0,
    isProjection: false,
  });

  // Generate future projections based on recurrence type
  if (expense.recurrence_type === 'once') {
    // One-time expenses don't repeat
    return occurrences;
  }

  let nextDate = new Date(startDate);
  let index = 1;

  while (true) {
    nextDate = getNextOccurrenceDate(nextDate, expense.recurrence_type);

    if (nextDate > endDate) break;

    occurrences.push({
      ...expense,
      projectedDate: new Date(nextDate),
      occurrenceIndex: index,
      isProjection: true,
      // Reset matched status for projections
      is_matched: false,
      matched_amount: undefined,
      matched_date: undefined,
    });

    index++;
  }

  return occurrences;
}

/**
 * Calculate the next occurrence date based on recurrence type
 */
function getNextOccurrenceDate(currentDate: Date, recurrenceType: string): Date {
  const next = new Date(currentDate);

  switch (recurrenceType) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'fortnightly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      // Unknown recurrence - treat as one-time
      next.setFullYear(next.getFullYear() + 100); // Far future
  }

  return next;
}

/**
 * Group projected expenses by timeline (month buckets)
 */
export function groupExpensesByTimeline(
  expenses: ProjectedExpense[],
  referenceDate: Date = getCurrentDate()
): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();

  const currentMonth = referenceDate.getMonth();
  const currentYear = referenceDate.getFullYear();

  expenses.forEach(expense => {
    const expenseDate = expense.projectedDate;
    const expenseMonth = expenseDate.getMonth();
    const expenseYear = expenseDate.getFullYear();

    // Determine the group key and label
    const { key, label, isPast } = getTimelineGroupInfo(
      expenseMonth,
      expenseYear,
      currentMonth,
      currentYear,
      referenceDate
    );

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        expenses: [],
        totalAmount: 0,
        isPast,
      });
    }

    const group = groups.get(key)!;
    group.expenses.push(expense);
    group.totalAmount += expense.expected_amount_cents;
  });

  // Sort expenses within each group by date
  groups.forEach(group => {
    group.expenses.sort((a, b) =>
      a.projectedDate.getTime() - b.projectedDate.getTime()
    );
  });

  // Convert to array and sort groups chronologically
  return Array.from(groups.values()).sort((a, b) => {
    // Past groups first (if any)
    if (a.isPast !== b.isPast) return a.isPast ? -1 : 1;

    // Custom sorting for special keys
    const keyOrder: Record<string, number> = {
      'this-month': 0,
      'next-month': 1,
    };

    const orderA = keyOrder[a.key] ?? 2;
    const orderB = keyOrder[b.key] ?? 2;

    // If both have special keys or both are regular date keys
    if (orderA !== orderB) return orderA - orderB;

    // For regular date keys (YYYY-MM format), sort chronologically
    if (orderA === 2 && orderB === 2) {
      return a.key.localeCompare(b.key);
    }

    return 0;
  });
}

/**
 * Get timeline group info for a given month/year
 * Only uses "This Month" / "Next Month" when viewing the actual current month
 */
function getTimelineGroupInfo(
  expenseMonth: number,
  expenseYear: number,
  currentMonth: number,
  currentYear: number,
  referenceDate: Date
): { key: string; label: string; isPast: boolean } {
  const monthDiff = (expenseYear - currentYear) * 12 + (expenseMonth - currentMonth);

  // Create a date for this month to get the month name
  const monthDate = new Date(expenseYear, expenseMonth, 1);
  const monthName = monthDate.toLocaleDateString('en-AU', { month: 'long' });

  // Check if the reference date is actually the current real month
  // Only use "This Month" / "Next Month" labels when viewing the real current month
  const realNow = new Date();
  const realCurrentMonth = realNow.getMonth();
  const realCurrentYear = realNow.getFullYear();
  const isViewingRealCurrentMonth = currentMonth === realCurrentMonth && currentYear === realCurrentYear;

  if (monthDiff < 0) {
    // Past month
    return {
      key: `${expenseYear}-${String(expenseMonth + 1).padStart(2, '0')}`,
      label: expenseYear === currentYear ? monthName : `${monthName} ${expenseYear}`,
      isPast: true,
    };
  }

  if (monthDiff === 0) {
    // Only use "This Month" if viewing the actual current month
    if (isViewingRealCurrentMonth) {
      return {
        key: 'this-month',
        label: 'This Month',
        isPast: false,
      };
    }
    // Otherwise use the month name
    return {
      key: `${expenseYear}-${String(expenseMonth + 1).padStart(2, '0')}`,
      label: expenseYear === realCurrentYear ? monthName : `${monthName} ${expenseYear}`,
      isPast: false,
    };
  }

  if (monthDiff === 1) {
    // Only use "Next Month" if viewing the actual current month
    if (isViewingRealCurrentMonth) {
      return {
        key: 'next-month',
        label: 'Next Month',
        isPast: false,
      };
    }
    // Otherwise use the month name
    const nextMonthDate = new Date(expenseYear, expenseMonth, 1);
    const nextMonthName = nextMonthDate.toLocaleDateString('en-AU', { month: 'long' });
    return {
      key: `${expenseYear}-${String(expenseMonth + 1).padStart(2, '0')}`,
      label: expenseYear === realCurrentYear ? nextMonthName : `${nextMonthName} ${expenseYear}`,
      isPast: false,
    };
  }

  // Future months (2+ months ahead)
  return {
    key: `${expenseYear}-${String(expenseMonth + 1).padStart(2, '0')}`,
    label: expenseYear === realCurrentYear ? monthName : `${monthName} ${expenseYear}`,
    isPast: false,
  };
}

/**
 * Generate all projections for multiple expenses and group them
 * Only shows the selected month and the next month (not all months in between)
 */
export function generateTimelineFromExpenses(
  expenses: ExpenseData[],
  monthsAhead: number = 1, // Only show selected month + next month
  referenceDate: Date = getCurrentDate()
): TimelineGroup[] {
  // Calculate the date range: only selected month and next month
  const selectedMonth = referenceDate.getMonth();
  const selectedYear = referenceDate.getFullYear();

  // End date is the last day of the month after the selected month
  const maxDate = new Date(selectedYear, selectedMonth + 2, 0); // Last day of next month

  // Generate projections for all expenses
  const allProjections: ProjectedExpense[] = [];

  expenses.forEach(expense => {
    const projections = generateProjectedOccurrences(expense, monthsAhead, referenceDate);
    // Filter out projections beyond our display window
    const filteredProjections = projections.filter(p => p.projectedDate <= maxDate);
    allProjections.push(...filteredProjections);
  });

  // Group by timeline
  const groups = groupExpensesByTimeline(allProjections, referenceDate);

  // Only keep groups for the selected month and the next month
  // Use the selected period's month, not the real current month
  return groups.filter(group => {
    // Always show special keys when viewing real current month
    if (group.key === 'this-month' || group.key === 'next-month') return true;

    // For date-keyed groups (YYYY-MM), only show selected month and next month
    if (group.key.match(/^\d{4}-\d{2}$/)) {
      const [year, month] = group.key.split('-').map(Number);
      const groupMonth = month - 1; // Convert to 0-indexed

      // Check if this is the selected month or the next month
      const isSelectedMonth = year === selectedYear && groupMonth === selectedMonth;
      const nextMonth = (selectedMonth + 1) % 12;
      const nextMonthYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
      const isNextMonth = year === nextMonthYear && groupMonth === nextMonth;

      return isSelectedMonth || isNextMonth;
    }

    return false; // Don't show past or other future groups
  });
}

/**
 * Check if an expense has any payment within the given period
 * Uses transaction date (when payment occurred) not for_period
 */
export function hasPaymentInPeriod(
  expense: ExpenseWithMatches,
  periodStart: Date,
  periodEnd: Date
): boolean {
  const matches = expense.expense_matches || [];
  return matches.some(match => {
    const rawTxn = match.transactions;
    const txn = Array.isArray(rawTxn) ? rawTxn[0] : rawTxn;
    if (txn && (txn.settled_at || txn.created_at)) {
      const txnDate = new Date(txn.settled_at || txn.created_at);
      return txnDate >= periodStart && txnDate <= periodEnd;
    }
    // Fallback to matched_at or for_period
    if (match.matched_at) {
      const matchedDate = new Date(match.matched_at);
      if (!isNaN(matchedDate.getTime())) {
        return matchedDate >= periodStart && matchedDate <= periodEnd;
      }
    }
    if (match.for_period) {
      const periodDate = new Date(match.for_period);
      if (!isNaN(periodDate.getTime())) {
        return periodDate >= periodStart && periodDate <= periodEnd;
      }
    }
    return false;
  });
}

/**
 * Separate paid expenses from unpaid for the current period
 * Dynamically checks expense_matches by transaction date (not stale is_matched)
 */
export function separatePaidExpenses(
  expenses: ExpenseWithMatches[],
  periodStart: Date,
  periodEnd: Date
): { paid: ExpenseWithMatches[]; unpaid: ExpenseWithMatches[] } {
  const paid: ExpenseWithMatches[] = [];
  const unpaid: ExpenseWithMatches[] = [];

  expenses.forEach(expense => {
    // Dynamically check if expense has payment in current period
    if (hasPaymentInPeriod(expense, periodStart, periodEnd)) {
      paid.push(expense);
    } else {
      unpaid.push(expense);
    }
  });

  // Sort paid by matched date (most recent first)
  paid.sort((a, b) => {
    const dateA = a.matched_date ? new Date(a.matched_date).getTime() : 0;
    const dateB = b.matched_date ? new Date(b.matched_date).getTime() : 0;
    return dateB - dateA;
  });

  // Sort unpaid by due date (soonest first)
  unpaid.sort((a, b) => {
    const dateA = new Date(a.next_due_date).getTime();
    const dateB = new Date(b.next_due_date).getTime();
    return dateA - dateB;
  });

  return { paid, unpaid };
}

/**
 * Generate paid expense instances for weekly/fortnightly expenses
 * Each match in the budget period becomes a separate instance
 */
export function generatePaidInstances(
  expenses: ExpenseWithMatches[],
  periodStart: Date,
  periodEnd: Date
): PaidExpenseInstance[] {
  const instances: PaidExpenseInstance[] = [];

  expenses.forEach(expense => {
    const matches = expense.expense_matches || [];

    // Filter matches by TRANSACTION DATE (when payment actually occurred)
    // This ensures "Paid This Period" shows payments made within the viewed budget period
    // NOT by for_period (which tracks billing cycles and can span month boundaries)
    const periodMatches = matches.filter(match => {
      // Handle transactions being an object or array (PostgREST can vary)
      const rawTxn = match.transactions;
      const txn = Array.isArray(rawTxn) ? rawTxn[0] : rawTxn;
      if (txn && (txn.settled_at || txn.created_at)) {
        const dateStr = txn.settled_at || txn.created_at;
        const txnDate = new Date(dateStr);
        if (isNaN(txnDate.getTime())) return false;
        return txnDate >= periodStart && txnDate <= periodEnd;
      }
      // Fallback: use matched_at (when the match was recorded)
      if (match.matched_at) {
        const matchedDate = new Date(match.matched_at);
        if (isNaN(matchedDate.getTime())) return false;
        return matchedDate >= periodStart && matchedDate <= periodEnd;
      }
      // Final fallback: use for_period (billing cycle start date)
      if (match.for_period) {
        const periodDate = new Date(match.for_period);
        if (isNaN(periodDate.getTime())) return false;
        return periodDate >= periodStart && periodDate <= periodEnd;
      }
      return false;
    });

    // For each match, create an instance
    periodMatches.forEach((match, index) => {
      const rawTxn = match.transactions;
      const txn = Array.isArray(rawTxn) ? rawTxn[0] : rawTxn;
      // Use actual payment date for the label
      const paymentDate = txn?.settled_at || txn?.created_at || match.matched_at;
      const displayDate = paymentDate ? new Date(paymentDate) : getCurrentDate();

      // For matches without for_period, derive it from transaction date
      const instancePeriod = match.for_period || (paymentDate ? paymentDate.split('T')[0] : null);

      // Generate human-readable label based on recurrence type - use actual payment date
      let instanceLabel: string;
      switch (expense.recurrence_type) {
        case 'weekly':
        case 'fortnightly':
          instanceLabel = displayDate.toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short'
          });
          break;
        default:
          instanceLabel = '';
      }

      // Get base matched amount
      // When a real transaction exists, apply split to its raw amount.
      // When falling back to expected_amount_cents, it's already split-adjusted
      // by viewAdjustedExpenses, so don't apply split again.
      let baseMatchedAmount: number;
      if (txn?.amount_cents) {
        baseMatchedAmount = Math.abs(txn.amount_cents);
        // Apply split to raw transaction amount
        if (expense.split_percentage !== undefined && expense.split_percentage !== 100) {
          baseMatchedAmount = Math.round(baseMatchedAmount * (expense.split_percentage / 100));
        }
      } else {
        baseMatchedAmount = expense.expected_amount_cents;
      }

      instances.push({
        ...expense,
        // Override with instance-specific data
        is_matched: true,
        matched_amount: baseMatchedAmount,
        matched_date: paymentDate,
        instance_period: instancePeriod || '',
        instance_label: instanceLabel,
        instance_index: index,
        // Include transaction_id for unique keys
        transaction_id: match.transaction_id,
      });
    });
  });

  // Sort by matched date (chronological order - oldest first)
  instances.sort((a, b) => {
    const dateA = a.matched_date ? new Date(a.matched_date).getTime() : 0;
    const dateB = b.matched_date ? new Date(b.matched_date).getTime() : 0;
    return dateA - dateB;
  });

  return instances;
}

/**
 * Condense paid instances by expense (e.g., "Deft Real Estate ×2")
 */
export interface CondensedPaidExpense extends ExpenseData {
  occurrenceCount: number;
  condensedLabel: string;
  totalAmountCents: number;
  allInstances: PaidExpenseInstance[];
}

export function condensePaidInstances(
  instances: PaidExpenseInstance[]
): CondensedPaidExpense[] {
  const byExpenseId = new Map<string, PaidExpenseInstance[]>();

  // Group instances by expense ID
  instances.forEach(instance => {
    if (!byExpenseId.has(instance.id)) {
      byExpenseId.set(instance.id, []);
    }
    byExpenseId.get(instance.id)!.push(instance);
  });

  // Convert to condensed format
  const condensed: CondensedPaidExpense[] = [];

  byExpenseId.forEach((expenseInstances) => {
    // Sort by date (most recent first)
    expenseInstances.sort((a, b) => {
      const dateA = a.matched_date ? new Date(a.matched_date).getTime() : 0;
      const dateB = b.matched_date ? new Date(b.matched_date).getTime() : 0;
      return dateB - dateA;
    });

    const first = expenseInstances[0];
    const count = expenseInstances.length;
    const totalAmount = expenseInstances.reduce(
      (sum, inst) => sum + (inst.matched_amount || inst.expected_amount_cents),
      0
    );

    condensed.push({
      ...first,
      occurrenceCount: count,
      condensedLabel: count > 1 ? `${first.name} ×${count}` : first.name,
      totalAmountCents: totalAmount,
      allInstances: expenseInstances,
    });
  });

  // Sort by earliest match date (chronological order)
  condensed.sort((a, b) => {
    // Use the earliest instance date for each condensed expense
    const dateA = a.allInstances[a.allInstances.length - 1]?.matched_date
      ? new Date(a.allInstances[a.allInstances.length - 1].matched_date!).getTime()
      : 0;
    const dateB = b.allInstances[b.allInstances.length - 1]?.matched_date
      ? new Date(b.allInstances[b.allInstances.length - 1].matched_date!).getTime()
      : 0;
    return dateA - dateB;
  });

  return condensed;
}

/**
 * Calculate cash flow summary for expenses
 */
export interface CashFlowSummary {
  thisMonth: {
    total: number;
    paid: number;
    remaining: number;
    percentPaid: number;
  };
  nextMonth: {
    total: number;
  };
  shortfall: number; // How much more is needed vs remaining budget
}

export function calculateCashFlowSummary(
  timelineGroups: TimelineGroup[],
  remainingBudget: number
): CashFlowSummary {
  const thisMonthGroup = timelineGroups.find(g => g.key === 'this-month');
  const nextMonthGroup = timelineGroups.find(g => g.key === 'next-month');

  const thisMonthTotal = thisMonthGroup?.totalAmount || 0;
  const thisMonthPaid = thisMonthGroup?.expenses
    .filter(e => e.is_matched)
    .reduce((sum, e) => sum + (e.matched_amount || e.expected_amount_cents), 0) || 0;
  const thisMonthRemaining = thisMonthTotal - thisMonthPaid;

  const nextMonthTotal = nextMonthGroup?.totalAmount || 0;

  // Calculate shortfall (if remaining expenses exceed remaining budget)
  const shortfall = Math.max(0, thisMonthRemaining - remainingBudget);

  return {
    thisMonth: {
      total: thisMonthTotal,
      paid: thisMonthPaid,
      remaining: thisMonthRemaining,
      percentPaid: thisMonthTotal > 0 ? (thisMonthPaid / thisMonthTotal) * 100 : 100,
    },
    nextMonth: {
      total: nextMonthTotal,
    },
    shortfall,
  };
}

/**
 * Condense recurring expenses within a timeline group
 * Groups expenses by name (e.g., "Gym x3" instead of 3 separate "Gym" entries)
 */
function condenseRecurringExpenses(
  group: TimelineGroup
): CondensedTimelineGroup {
  const expensesByName = new Map<string, ProjectedExpense[]>();

  // Group expenses by their name (id is unique per expense definition)
  group.expenses.forEach(expense => {
    const key = expense.id; // Use expense ID to group occurrences of the same expense
    if (!expensesByName.has(key)) {
      expensesByName.set(key, []);
    }
    expensesByName.get(key)!.push(expense);
  });

  // Convert to condensed expenses
  const condensedExpenses: CondensedExpense[] = [];

  expensesByName.forEach((occurrences) => {
    // Sort by date (earliest first)
    occurrences.sort((a, b) => a.projectedDate.getTime() - b.projectedDate.getTime());

    const firstOccurrence = occurrences[0];
    const count = occurrences.length;
    const totalAmount = occurrences.reduce((sum, e) => sum + e.expected_amount_cents, 0);

    condensedExpenses.push({
      ...firstOccurrence,
      occurrenceCount: count,
      condensedLabel: count > 1 ? `${firstOccurrence.name} ×${count}` : firstOccurrence.name,
      totalAmountCents: totalAmount,
      allOccurrences: occurrences,
    });
  });

  // Sort condensed expenses by earliest occurrence date
  condensedExpenses.sort((a, b) => a.projectedDate.getTime() - b.projectedDate.getTime());

  return {
    key: group.key,
    label: group.label,
    expenses: condensedExpenses,
    totalAmount: group.totalAmount,
    isPast: group.isPast,
  };
}

/**
 * Condense all timeline groups
 */
export function condenseTimelineGroups(
  groups: TimelineGroup[]
): CondensedTimelineGroup[] {
  return groups.map(condenseRecurringExpenses);
}
