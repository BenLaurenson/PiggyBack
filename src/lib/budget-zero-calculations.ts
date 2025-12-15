/**
 * Zero-Based Budget Calculations
 * Core logic for YNAB-style budgeting system
 */

import { createClient } from "@/utils/supabase/client";
import { getCurrentDate } from "@/lib/demo-guard";

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface BudgetAssignment {
  id: string;
  partnership_id: string;
  month: string; // ISO date string (2025-12-01)
  category_name: string;
  assigned_cents: number;
  notes?: string;
  created_by?: string;
}

// Import from canonical location and re-export for backward compatibility
import type { ExpenseDefinition } from '@/types/expense';
export type { ExpenseDefinition } from '@/types/expense';

export interface CoupleSplitSetting {
  id: string;
  partnership_id: string;
  category_name?: string;
  expense_definition_id?: string;
  split_type: 'equal' | 'custom' | 'individual-owner' | 'individual-partner';
  owner_percentage?: number;
}

export interface SplitResult {
  ownerAmount: number;
  partnerAmount: number;
  ownerPercentage: number;
  partnerPercentage: number;
  isShared: boolean;
  splitType: string;
}

// =====================================================
// TO BE BUDGETED (TBB) CALCULATION
// =====================================================

/**
 * Calculate "To Be Budgeted" for a given month
 * Formula: TBB = Income + Carryover - Assigned
 */
export function calculateToBeBudgeted(
  income: number,
  assigned: number,
  carryover: number
): number {
  return income + carryover - assigned;
}

/**
 * Get month as first day of month (2025-12-01)
 */
export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Parse month key to Date
 */
export function parseMonthKey(monthKey: string): Date {
  return new Date(monthKey);
}

/**
 * Get previous month key
 */
export function getPreviousMonth(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() - 1);
  return getMonthKey(date);
}

/**
 * Get next month key
 */
export function getNextMonth(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + 1);
  return getMonthKey(date);
}

/**
 * Check if month is current month
 */
export function isCurrentMonth(monthKey: string): boolean {
  const current = getMonthKey(getCurrentDate());
  return monthKey === current;
}

// =====================================================
// CATEGORY CALCULATIONS
// =====================================================

/**
 * Calculate available amount for category
 * Available = Assigned - Spent
 */
export function calculateAvailable(assigned: number, spent: number): number {
  return assigned - spent;
}

/**
 * Calculate percentage spent
 */
export function calculatePercentage(spent: number, assigned: number): number {
  if (assigned === 0) return 0;
  return (spent / assigned) * 100;
}

/**
 * Determine category budget status
 */
export function getCategoryStatus(spent: number, assigned: number): 'under' | 'at' | 'over' | 'none' {
  if (assigned === 0) return 'none';
  const percentage = calculatePercentage(spent, assigned);

  if (percentage >= 100) return 'over';
  if (percentage >= 95) return 'at';
  return 'under';
}

// =====================================================
// COUPLE SPLIT CALCULATIONS
// =====================================================

/**
 * Calculate expense split between partners
 * Priority: expense-specific > category-specific > default
 */
export function calculateSplit(
  amount: number,
  expenseId: string | null,
  categoryName: string,
  settings: CoupleSplitSetting[]
): SplitResult {
  // Find most specific setting (priority order)
  let setting: CoupleSplitSetting | undefined;

  // 1. Expense-specific setting (highest priority)
  if (expenseId) {
    setting = settings.find(s => s.expense_definition_id === expenseId);
  }

  // 2. Category-specific setting
  if (!setting) {
    setting = settings.find(s => s.category_name === categoryName);
  }

  // 3. Default setting (lowest priority)
  if (!setting) {
    setting = settings.find(s => !s.category_name && !s.expense_definition_id);
  }

  // Apply split calculation
  return applySplitSetting(amount, setting);
}

/**
 * Apply split setting to an amount
 */
function applySplitSetting(
  amount: number,
  setting: CoupleSplitSetting | undefined
): SplitResult {
  // Default to equal if no setting
  if (!setting) {
    return {
      ownerAmount: amount / 2,
      partnerAmount: amount / 2,
      ownerPercentage: 50,
      partnerPercentage: 50,
      isShared: true,
      splitType: 'equal',
    };
  }

  switch (setting.split_type) {
    case 'equal':
      return {
        ownerAmount: amount / 2,
        partnerAmount: amount / 2,
        ownerPercentage: 50,
        partnerPercentage: 50,
        isShared: true,
        splitType: 'equal',
      };

    case 'custom':
      const ownerPct = setting.owner_percentage || 50;
      const partnerPct = 100 - ownerPct;
      return {
        ownerAmount: (amount * ownerPct) / 100,
        partnerAmount: (amount * partnerPct) / 100,
        ownerPercentage: ownerPct,
        partnerPercentage: partnerPct,
        isShared: true,
        splitType: 'custom',
      };

    case 'individual-owner':
      return {
        ownerAmount: amount,
        partnerAmount: 0,
        ownerPercentage: 100,
        partnerPercentage: 0,
        isShared: false,
        splitType: 'individual-owner',
      };

    case 'individual-partner':
      return {
        ownerAmount: 0,
        partnerAmount: amount,
        ownerPercentage: 0,
        partnerPercentage: 100,
        isShared: false,
        splitType: 'individual-partner',
      };

    default:
      // Fallback to equal
      return {
        ownerAmount: amount / 2,
        partnerAmount: amount / 2,
        ownerPercentage: 50,
        partnerPercentage: 50,
        isShared: true,
        splitType: 'equal',
      };
  }
}

// =====================================================
// EXPENSE DUE DATE CALCULATIONS
// =====================================================

/**
 * Calculate next due date for recurring expense
 */
export function calculateNextDueDate(
  currentDueDate: Date,
  recurrenceType: string
): Date {
  const next = new Date(currentDueDate);

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
    case 'one-time':
      // Don't advance for one-time expenses
      return next;
  }

  return next;
}

/**
 * Check if expense is overdue
 */
export function isExpenseOverdue(dueDate: Date): boolean {
  return dueDate < getCurrentDate();
}

/**
 * Get days until expense due
 */
export function getDaysUntilDue(dueDate: Date): number {
  const now = getCurrentDate();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Categorize expense by urgency
 */
export function getExpenseUrgency(dueDate: Date): 'overdue' | 'due-today' | 'due-soon' | 'upcoming' | 'future' {
  const days = getDaysUntilDue(dueDate);

  if (days < 0) return 'overdue';
  if (days === 0) return 'due-today';
  if (days <= 3) return 'due-soon';
  if (days <= 7) return 'upcoming';
  return 'future';
}

/**
 * Determine which time-based group an expense belongs to
 * Order: PAID, THIS WEEK, THIS MONTH, THIS QUARTER, THIS YEAR, NEXT YEAR, OVERDUE (last)
 */
export function getExpenseGroup(
  expense: {
    next_due_date: string;
    recurrence_type: string;
    is_matched: boolean;
  },
  now: Date = getCurrentDate()
): 'paid' | 'this-week' | 'this-month' | 'this-quarter' | 'this-year' | 'next-year' | 'overdue' {
  // PAID: Has payment for current period
  if (expense.is_matched) {
    return 'paid';
  }

  const dueDate = new Date(expense.next_due_date);

  // OVERDUE: Past due date and not paid
  if (dueDate < now) {
    return 'overdue';
  }

  // Calculate time period boundaries (rolling windows)
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(now.getDate() + 7);

  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(now.getDate() + 30);

  const threeMonthsFromNow = new Date(now);
  threeMonthsFromNow.setMonth(now.getMonth() + 3);

  const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  // THIS WEEK: Due within next 7 days
  if (dueDate <= sevenDaysFromNow) {
    return 'this-week';
  }

  // THIS MONTH: Due within next 30 days (after this week)
  if (dueDate <= thirtyDaysFromNow) {
    return 'this-month';
  }

  // THIS QUARTER: Due within next 3 months (after this month)
  if (dueDate <= threeMonthsFromNow) {
    return 'this-quarter';
  }

  // THIS YEAR: Due within current year (after this quarter)
  if (dueDate <= endOfYear) {
    return 'this-year';
  }

  // NEXT YEAR: Due next year or beyond
  return 'next-year';
}

// =====================================================
// BUDGET RECOMMENDATIONS
// =====================================================

/**
 * Suggest budget amount based on historical spending
 */
export function suggestBudgetAmount(
  historicalSpending: number[], // Last N months
  method: 'average' | 'median' | 'last-month' = 'average'
): number {
  if (historicalSpending.length === 0) return 0;

  switch (method) {
    case 'average':
      return Math.round(
        historicalSpending.reduce((sum, val) => sum + val, 0) / historicalSpending.length
      );

    case 'median':
      const sorted = [...historicalSpending].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];

    case 'last-month':
      return historicalSpending[historicalSpending.length - 1];

    default:
      return 0;
  }
}

/**
 * Calculate budget health score (0-100)
 */
export function calculateBudgetHealth(
  toBeBudgeted: number,
  assignments: BudgetAssignment[],
  spending: Map<string, number>,
  expenses: ExpenseDefinition[],
  matches: ExpenseMatch[]
): number {
  let score = 0;

  // +20: TBB is $0 (fully budgeted)
  if (toBeBudgeted === 0) score += 20;

  // +20: All categories under or at budget
  const allUnderBudget = assignments.every(a => {
    const spent = spending.get(a.category_name) || 0;
    return spent <= a.assigned_cents;
  });
  if (allUnderBudget) score += 20;

  // +20: All expected expenses paid on time
  const paidExpenses = expenses.filter(e => {
    const match = matches.find(m => m.expense_definition_id === e.id);
    return match && new Date(match.matched_at) <= new Date(e.next_due_date);
  });
  const expenseScore = expenses.length > 0
    ? (paidExpenses.length / expenses.length) * 20
    : 20;
  score += expenseScore;

  // +20: Income assigned >= 90%
  if (toBeBudgeted >= 0) {
    const totalIncome = assignments.reduce((sum, a) => sum + a.assigned_cents, 0) + toBeBudgeted;
    const assignedPct = totalIncome > 0 ? (assignments.reduce((sum, a) => sum + a.assigned_cents, 0) / totalIncome) * 100 : 0;
    if (assignedPct >= 90) score += 20;
  }

  // +20: No negative categories (not overspending without budget)
  const noNegatives = assignments.every(a => {
    const spent = spending.get(a.category_name) || 0;
    const available = a.assigned_cents - spent;
    return available >= 0;
  });
  if (noNegatives) score += 20;

  return Math.min(100, Math.max(0, score));
}

// =====================================================
// PERIOD CALCULATIONS
// =====================================================

/**
 * Calculate income for budget period
 * Prorates monthly income for weekly/fortnightly budgeting
 */
export function calculatePeriodIncome(
  monthlyIncome: number,
  periodType: 'weekly' | 'fortnightly' | 'monthly'
): number {
  switch (periodType) {
    case 'weekly':
      // Monthly income ÷ 4 (intuitive weeks per month)
      return Math.round(monthlyIncome / 4);

    case 'fortnightly':
      // Monthly income ÷ 2 (intuitive fortnights per month)
      return Math.round(monthlyIncome / 2);

    case 'monthly':
      return monthlyIncome;

    default:
      return monthlyIncome;
  }
}

// =====================================================
// CURRENCY FORMATTING
// =====================================================

/**
 * Format cents as currency string
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// =====================================================
// MONTH ROLLOVER
// =====================================================

/**
 * Calculate carryover to next month
 * Carryover = Previous month's TBB (if positive)
 */
export function calculateCarryover(previousTBB: number): number {
  return Math.max(0, previousTBB);
}

/**
 * Process end of month rollover
 * Returns carryover amount for next month
 */
export function processMonthRollover(
  income: number,
  assigned: number,
  previousCarryover: number
): { carryover: number; finalTBB: number } {
  const finalTBB = calculateToBeBudgeted(income, assigned, previousCarryover);
  const carryover = calculateCarryover(finalTBB);

  return { carryover, finalTBB };
}

// =====================================================
// EXPENSE STATUS
// =====================================================

/**
 * Determine expense payment status
 */
export interface ExpenseStatus {
  status: 'paid' | 'pending' | 'overdue';
  label: string;
  color: string;
  icon: string;
}

export function getExpenseStatus(
  expense: ExpenseDefinition,
  isMatched: boolean
): ExpenseStatus {
  if (isMatched) {
    return {
      status: 'paid',
      label: 'Paid',
      color: 'var(--grass-9)',
      icon: '✅',
    };
  }

  const daysUntil = getDaysUntilDue(new Date(expense.next_due_date));

  if (daysUntil < 0) {
    return {
      status: 'overdue',
      label: `Overdue (${Math.abs(daysUntil)}d)`,
      color: 'var(--pastel-coral)',
      icon: '⚠️',
    };
  }

  if (daysUntil <= 3) {
    return {
      status: 'pending',
      label: `Due in ${daysUntil}d`,
      color: 'var(--amber-9)',
      icon: '⏰',
    };
  }

  return {
    status: 'pending',
    label: 'Pending',
    color: 'var(--slate-9)',
    icon: '📅',
  };
}

// =====================================================
// EXPENSE MATCH TYPE
// =====================================================

/**
 * Typed replacement for `any[]` in match-related functions.
 * Represents a row from the expense_matches table.
 */
export interface ExpenseMatch {
  expense_definition_id: string;
  matched_at: string;
  transaction_id?: string;
  match_confidence?: number;
  for_period?: string;
  matched_by?: string;
}

/**
 * Runtime field list for test verification.
 */
export const EXPENSE_MATCH_FIELDS = [
  'expense_definition_id',
  'matched_at',
  'transaction_id',
  'match_confidence',
  'for_period',
  'matched_by',
] as const;

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Group expenses by urgency
 */
export function groupExpensesByUrgency(
  expenses: ExpenseDefinition[],
  matches: ExpenseMatch[]
): Record<string, ExpenseDefinition[]> {
  const groups: Record<string, ExpenseDefinition[]> = {
    overdue: [],
    'this-week': [],
    'next-week': [],
    'this-month': [],
    future: [],
  };

  expenses.forEach(expense => {
    // Skip if already paid
    const isMatched = matches.some(m => m.expense_definition_id === expense.id);
    if (isMatched) return;

    const daysUntil = getDaysUntilDue(new Date(expense.next_due_date));

    if (daysUntil < 0) {
      groups.overdue.push(expense);
    } else if (daysUntil <= 7) {
      groups['this-week'].push(expense);
    } else if (daysUntil <= 14) {
      groups['next-week'].push(expense);
    } else if (daysUntil <= 31) {
      groups['this-month'].push(expense);
    } else {
      groups.future.push(expense);
    }
  });

  return groups;
}

/**
 * Get summary statistics for budget month
 */
export interface BudgetMonthSummary {
  income: number;
  assigned: number;
  spent: number;
  available: number;
  toBeBudgeted: number;
  budgetedCategories: number;
  totalCategories: number;
  percentBudgeted: number;
}

export function calculateBudgetSummary(
  income: number,
  carryover: number,
  assignments: BudgetAssignment[],
  categorySpending: Map<string, number>,
  totalCategories: number
): BudgetMonthSummary {
  const assigned = assignments.reduce((sum, a) => sum + a.assigned_cents, 0);
  const spent = Array.from(categorySpending.values()).reduce((sum, val) => sum + val, 0);
  const toBeBudgeted = calculateToBeBudgeted(income, assigned, carryover);
  const available = assigned - spent;
  const budgetedCategories = assignments.filter(a => a.assigned_cents > 0).length;
  const percentBudgeted = totalCategories > 0 ? (budgetedCategories / totalCategories) * 100 : 0;

  return {
    income,
    assigned,
    spent,
    available,
    toBeBudgeted,
    budgetedCategories,
    totalCategories,
    percentBudgeted,
  };
}
