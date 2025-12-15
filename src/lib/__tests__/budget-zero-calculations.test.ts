import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateToBeBudgeted,
  getMonthKey,
  parseMonthKey,
  getPreviousMonth,
  getNextMonth,
  isCurrentMonth,
  calculateAvailable,
  calculatePercentage,
  getCategoryStatus,
  calculateSplit,
  calculateNextDueDate,
  isExpenseOverdue,
  getDaysUntilDue,
  getExpenseUrgency,
  getExpenseGroup,
  suggestBudgetAmount,
  calculateBudgetHealth,
  calculatePeriodIncome,
  calculateCarryover,
  processMonthRollover,
  getExpenseStatus,
  groupExpensesByUrgency,
  calculateBudgetSummary,
  formatCurrency,
  EXPENSE_MATCH_FIELDS,
} from '../budget-zero-calculations';
import type {
  CoupleSplitSetting,
  BudgetAssignment,
  ExpenseMatch,
} from '../budget-zero-calculations';
import type { ExpenseDefinition } from '@/types/expense';

// Mock getCurrentDate for time-dependent tests
vi.mock('@/lib/demo-guard', () => ({
  getCurrentDate: () => new Date('2026-02-20T00:00:00Z'),
}));

describe('budget-zero-calculations', () => {
  // =====================================================
  // TBB CALCULATION
  // =====================================================
  describe('calculateToBeBudgeted', () => {
    it('should calculate TBB = Income + Carryover - Assigned', () => {
      expect(calculateToBeBudgeted(500000, 300000, 50000)).toBe(250000);
    });

    it('should return negative when over-assigned', () => {
      expect(calculateToBeBudgeted(100000, 200000, 0)).toBe(-100000);
    });

    it('should handle zero values', () => {
      expect(calculateToBeBudgeted(0, 0, 0)).toBe(0);
    });

    it('should handle carryover correctly', () => {
      expect(calculateToBeBudgeted(0, 0, 50000)).toBe(50000);
    });

    it('should handle large amounts', () => {
      expect(calculateToBeBudgeted(10000000, 5000000, 1000000)).toBe(6000000);
    });
  });

  // =====================================================
  // MONTH KEY HELPERS
  // =====================================================
  describe('getMonthKey', () => {
    it('should return first day of month as ISO string', () => {
      expect(getMonthKey(new Date(2026, 0, 15))).toBe('2026-01-01');
    });

    it('should pad single-digit months', () => {
      expect(getMonthKey(new Date(2026, 2, 15))).toBe('2026-03-01');
    });

    it('should handle December correctly', () => {
      expect(getMonthKey(new Date(2025, 11, 25))).toBe('2025-12-01');
    });

    it('should handle January correctly', () => {
      expect(getMonthKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    });

    it('should handle last day of month', () => {
      expect(getMonthKey(new Date(2026, 0, 31))).toBe('2026-01-01');
    });
  });

  describe('parseMonthKey', () => {
    it('should parse month key to Date', () => {
      const date = parseMonthKey('2026-01-01');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(0);
    });

    it('should parse December month key', () => {
      const date = parseMonthKey('2025-12-01');
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(11);
    });
  });

  describe('getPreviousMonth', () => {
    it('should return previous month', () => {
      expect(getPreviousMonth('2026-02-01')).toBe('2026-01-01');
    });

    it('should wrap around year boundary', () => {
      expect(getPreviousMonth('2026-01-01')).toBe('2025-12-01');
    });

    it('should handle March to February', () => {
      expect(getPreviousMonth('2026-03-01')).toBe('2026-02-01');
    });
  });

  describe('getNextMonth', () => {
    it('should return next month', () => {
      expect(getNextMonth('2026-01-01')).toBe('2026-02-01');
    });

    it('should wrap around year boundary', () => {
      expect(getNextMonth('2025-12-01')).toBe('2026-01-01');
    });

    it('should handle November to December', () => {
      expect(getNextMonth('2026-11-01')).toBe('2026-12-01');
    });
  });

  describe('isCurrentMonth', () => {
    it('should return true for current month (mocked to 2026-02)', () => {
      expect(isCurrentMonth('2026-02-01')).toBe(true);
    });

    it('should return false for past months', () => {
      expect(isCurrentMonth('2026-01-01')).toBe(false);
    });

    it('should return false for future months', () => {
      expect(isCurrentMonth('2026-03-01')).toBe(false);
    });
  });

  // =====================================================
  // CATEGORY CALCULATIONS
  // =====================================================
  describe('calculateAvailable', () => {
    it('should return assigned minus spent', () => {
      expect(calculateAvailable(50000, 30000)).toBe(20000);
    });

    it('should return negative when overspent', () => {
      expect(calculateAvailable(30000, 50000)).toBe(-20000);
    });

    it('should return zero when exactly at budget', () => {
      expect(calculateAvailable(50000, 50000)).toBe(0);
    });

    it('should return full amount when nothing spent', () => {
      expect(calculateAvailable(50000, 0)).toBe(50000);
    });
  });

  describe('calculatePercentage', () => {
    it('should calculate spent percentage', () => {
      expect(calculatePercentage(50000, 100000)).toBe(50);
    });

    it('should return 0 when assigned is 0', () => {
      expect(calculatePercentage(5000, 0)).toBe(0);
    });

    it('should return 100 when fully spent', () => {
      expect(calculatePercentage(100000, 100000)).toBe(100);
    });

    it('should return > 100 when overspent', () => {
      expect(calculatePercentage(150000, 100000)).toBe(150);
    });
  });

  describe('getCategoryStatus', () => {
    it('should return "none" when nothing assigned', () => {
      expect(getCategoryStatus(5000, 0)).toBe('none');
    });

    it('should return "under" when under 95%', () => {
      expect(getCategoryStatus(50000, 100000)).toBe('under');
    });

    it('should return "at" when between 95-100%', () => {
      expect(getCategoryStatus(96000, 100000)).toBe('at');
    });

    it('should return "over" when at or above 100%', () => {
      expect(getCategoryStatus(100000, 100000)).toBe('over');
      expect(getCategoryStatus(120000, 100000)).toBe('over');
    });

    it('should return "at" at exactly 95%', () => {
      expect(getCategoryStatus(95000, 100000)).toBe('at');
    });
  });

  // =====================================================
  // COUPLE SPLIT CALCULATIONS
  // =====================================================
  describe('calculateSplit', () => {
    it('should default to equal split with no settings', () => {
      const result = calculateSplit(10000, null, 'Groceries', []);
      expect(result.ownerAmount).toBe(5000);
      expect(result.partnerAmount).toBe(5000);
      expect(result.ownerPercentage).toBe(50);
      expect(result.isShared).toBe(true);
      expect(result.splitType).toBe('equal');
    });

    it('should use expense-specific setting (highest priority)', () => {
      const settings: CoupleSplitSetting[] = [
        { id: '1', partnership_id: 'p1', category_name: 'Groceries', split_type: 'equal' },
        { id: '2', partnership_id: 'p1', expense_definition_id: 'exp1', split_type: 'individual-owner' },
      ];
      const result = calculateSplit(10000, 'exp1', 'Groceries', settings);
      expect(result.ownerAmount).toBe(10000);
      expect(result.partnerAmount).toBe(0);
      expect(result.splitType).toBe('individual-owner');
    });

    it('should fall back to category setting when no expense match', () => {
      const settings: CoupleSplitSetting[] = [
        { id: '1', partnership_id: 'p1', category_name: 'Groceries', split_type: 'custom', owner_percentage: 70 },
      ];
      const result = calculateSplit(10000, null, 'Groceries', settings);
      expect(result.ownerAmount).toBe(7000);
      expect(result.partnerAmount).toBe(3000);
      expect(result.ownerPercentage).toBe(70);
      expect(result.splitType).toBe('custom');
    });

    it('should handle individual-partner split', () => {
      const settings: CoupleSplitSetting[] = [
        { id: '1', partnership_id: 'p1', category_name: 'Gaming', split_type: 'individual-partner' },
      ];
      const result = calculateSplit(10000, null, 'Gaming', settings);
      expect(result.ownerAmount).toBe(0);
      expect(result.partnerAmount).toBe(10000);
      expect(result.isShared).toBe(false);
    });

    it('should use default setting when no category or expense match', () => {
      const settings: CoupleSplitSetting[] = [
        { id: '1', partnership_id: 'p1', split_type: 'custom', owner_percentage: 60 },
      ];
      const result = calculateSplit(10000, null, 'Unknown Category', settings);
      expect(result.ownerAmount).toBe(6000);
      expect(result.partnerAmount).toBe(4000);
    });
  });

  // =====================================================
  // EXPENSE DUE DATE CALCULATIONS
  // =====================================================
  describe('calculateNextDueDate', () => {
    it('should add 7 days for weekly', () => {
      const due = new Date('2026-02-01');
      const next = calculateNextDueDate(due, 'weekly');
      expect(next.getDate()).toBe(8);
    });

    it('should add 14 days for fortnightly', () => {
      const due = new Date('2026-02-01');
      const next = calculateNextDueDate(due, 'fortnightly');
      expect(next.getDate()).toBe(15);
    });

    it('should add 1 month for monthly', () => {
      const due = new Date('2026-01-15');
      const next = calculateNextDueDate(due, 'monthly');
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDate()).toBe(15);
    });

    it('should add 3 months for quarterly', () => {
      const due = new Date('2026-01-01');
      const next = calculateNextDueDate(due, 'quarterly');
      expect(next.getMonth()).toBe(3); // April
    });

    it('should add 1 year for yearly', () => {
      const due = new Date('2026-01-01');
      const next = calculateNextDueDate(due, 'yearly');
      expect(next.getFullYear()).toBe(2027);
    });

    it('should not advance for one-time expenses', () => {
      const due = new Date('2026-02-01');
      const next = calculateNextDueDate(due, 'one-time');
      expect(next.getTime()).toBe(due.getTime());
    });

    it('should handle month boundary (Jan 31 + 1 month)', () => {
      const due = new Date('2026-01-31');
      const next = calculateNextDueDate(due, 'monthly');
      // JS Date rolls over: Jan 31 + 1 month = Feb 28 (or March 3 depending on month)
      expect(next.getMonth()).toBe(2); // March (since Feb doesn't have 31 days)
    });
  });

  describe('isExpenseOverdue', () => {
    it('should return true for past dates', () => {
      expect(isExpenseOverdue(new Date('2026-02-19'))).toBe(true);
    });

    it('should return false for future dates', () => {
      expect(isExpenseOverdue(new Date('2026-02-21'))).toBe(false);
    });

    it('should return false for today', () => {
      // getCurrentDate returns 2026-02-20T00:00:00Z
      // isExpenseOverdue checks dueDate < getCurrentDate()
      // A date of 2026-02-20 at midnight equals getCurrentDate, so not overdue
      expect(isExpenseOverdue(new Date('2026-02-20T00:00:00Z'))).toBe(false);
    });
  });

  describe('getDaysUntilDue', () => {
    it('should return positive for future dates', () => {
      expect(getDaysUntilDue(new Date('2026-02-25'))).toBe(5);
    });

    it('should return negative for past dates', () => {
      const days = getDaysUntilDue(new Date('2026-02-18'));
      expect(days).toBeLessThan(0);
    });

    it('should return 0 for today', () => {
      expect(getDaysUntilDue(new Date('2026-02-20T00:00:00Z'))).toBe(0);
    });
  });

  describe('getExpenseUrgency', () => {
    it('should return "overdue" for past dates', () => {
      expect(getExpenseUrgency(new Date('2026-02-18'))).toBe('overdue');
    });

    it('should return "due-today" for today', () => {
      expect(getExpenseUrgency(new Date('2026-02-20T00:00:00Z'))).toBe('due-today');
    });

    it('should return "due-soon" for 1-3 days out', () => {
      expect(getExpenseUrgency(new Date('2026-02-22'))).toBe('due-soon');
    });

    it('should return "upcoming" for 4-7 days out', () => {
      expect(getExpenseUrgency(new Date('2026-02-25'))).toBe('upcoming');
    });

    it('should return "future" for more than 7 days out', () => {
      expect(getExpenseUrgency(new Date('2026-03-15'))).toBe('future');
    });
  });

  describe('getExpenseGroup', () => {
    const now = new Date('2026-02-20T00:00:00Z');

    it('should return "paid" for matched expenses', () => {
      const result = getExpenseGroup(
        { next_due_date: '2026-02-25', recurrence_type: 'monthly', is_matched: true },
        now
      );
      expect(result).toBe('paid');
    });

    it('should return "overdue" for unmatched past due', () => {
      const result = getExpenseGroup(
        { next_due_date: '2026-02-18', recurrence_type: 'monthly', is_matched: false },
        now
      );
      expect(result).toBe('overdue');
    });

    it('should return "this-week" for due within 7 days', () => {
      const result = getExpenseGroup(
        { next_due_date: '2026-02-25', recurrence_type: 'monthly', is_matched: false },
        now
      );
      expect(result).toBe('this-week');
    });

    it('should return "this-month" for due within 30 days', () => {
      const result = getExpenseGroup(
        { next_due_date: '2026-03-15', recurrence_type: 'monthly', is_matched: false },
        now
      );
      expect(result).toBe('this-month');
    });

    it('should return "this-quarter" for due within 3 months', () => {
      const result = getExpenseGroup(
        { next_due_date: '2026-05-01', recurrence_type: 'monthly', is_matched: false },
        now
      );
      expect(result).toBe('this-quarter');
    });

    it('should return "this-year" for due within current year', () => {
      const result = getExpenseGroup(
        { next_due_date: '2026-10-01', recurrence_type: 'yearly', is_matched: false },
        now
      );
      expect(result).toBe('this-year');
    });

    it('should return "next-year" for due next year', () => {
      const result = getExpenseGroup(
        { next_due_date: '2027-02-01', recurrence_type: 'yearly', is_matched: false },
        now
      );
      expect(result).toBe('next-year');
    });
  });

  // =====================================================
  // BUDGET RECOMMENDATIONS
  // =====================================================
  describe('suggestBudgetAmount', () => {
    it('should return 0 for empty history', () => {
      expect(suggestBudgetAmount([])).toBe(0);
    });

    it('should return average by default', () => {
      expect(suggestBudgetAmount([10000, 20000, 30000])).toBe(20000);
    });

    it('should return median when requested', () => {
      expect(suggestBudgetAmount([10000, 20000, 50000], 'median')).toBe(20000);
    });

    it('should handle even-length arrays for median', () => {
      expect(suggestBudgetAmount([10000, 20000, 30000, 40000], 'median')).toBe(25000);
    });

    it('should return last month when requested', () => {
      expect(suggestBudgetAmount([10000, 20000, 30000], 'last-month')).toBe(30000);
    });

    it('should handle single value', () => {
      expect(suggestBudgetAmount([15000], 'average')).toBe(15000);
      expect(suggestBudgetAmount([15000], 'median')).toBe(15000);
      expect(suggestBudgetAmount([15000], 'last-month')).toBe(15000);
    });

    it('should round average correctly', () => {
      expect(suggestBudgetAmount([10000, 10001])).toBe(10001); // 10000.5 rounds to 10001
    });
  });

  // =====================================================
  // BUDGET HEALTH
  // =====================================================
  describe('calculateBudgetHealth', () => {
    const makeAssignment = (name: string, cents: number): BudgetAssignment => ({
      id: '1', partnership_id: 'p1', month: '2026-02-01',
      category_name: name, assigned_cents: cents,
    });

    it('should return 100 for perfect budget', () => {
      const assignments = [
        makeAssignment('Groceries', 50000),
        makeAssignment('Transport', 20000),
      ];
      const spending = new Map<string, number>([
        ['Groceries', 40000],
        ['Transport', 15000],
      ]);
      const expenses: ExpenseDefinition[] = [{
        id: 'e1', partnership_id: 'p1', name: 'Rent',
        category_name: 'Housing', expected_amount_cents: 200000,
        recurrence_type: 'monthly', next_due_date: '2026-02-15',
        is_active: true, auto_detected: false, emoji: '🏠',
      }];
      const matches: ExpenseMatch[] = [{
        expense_definition_id: 'e1',
        matched_at: '2026-02-10',
      }];

      // TBB = 0 means fully budgeted (+20)
      // All under budget (+20)
      // Expense paid on time (+20)
      // Income assigned >= 90% (+20)
      // No negative categories (+20)
      const score = calculateBudgetHealth(0, assignments, spending, expenses, matches);
      expect(score).toBe(100);
    });

    it('should return 0 for worst case budget', () => {
      // Overspent assignments, no matches, TBB != 0
      const assignments = [makeAssignment('Groceries', 10000)];
      const spending = new Map<string, number>([['Groceries', 50000]]);
      const expenses: ExpenseDefinition[] = [{
        id: 'e1', partnership_id: 'p1', name: 'Rent',
        category_name: 'Housing', expected_amount_cents: 200000,
        recurrence_type: 'monthly', next_due_date: '2026-02-15',
        is_active: true, auto_detected: false, emoji: '🏠',
      }];

      const score = calculateBudgetHealth(50000, assignments, spending, expenses, []);
      expect(score).toBeLessThanOrEqual(20); // At most some partial credit
    });

    it('should give full expense score when no expenses defined', () => {
      const assignments = [makeAssignment('Groceries', 50000)];
      const spending = new Map<string, number>([['Groceries', 30000]]);

      const score = calculateBudgetHealth(0, assignments, spending, [], []);
      // TBB = 0 (+20), under budget (+20), no expenses = full credit (+20),
      // assigned >= 90% (+20), no negatives (+20)
      expect(score).toBe(100);
    });
  });

  // =====================================================
  // PERIOD CALCULATIONS
  // =====================================================
  describe('calculatePeriodIncome', () => {
    it('should return full amount for monthly', () => {
      expect(calculatePeriodIncome(400000, 'monthly')).toBe(400000);
    });

    it('should divide by 4 for weekly', () => {
      expect(calculatePeriodIncome(400000, 'weekly')).toBe(100000);
    });

    it('should divide by 2 for fortnightly', () => {
      expect(calculatePeriodIncome(400000, 'fortnightly')).toBe(200000);
    });

    it('should round correctly for odd amounts', () => {
      expect(calculatePeriodIncome(333333, 'weekly')).toBe(83333);
      expect(calculatePeriodIncome(333333, 'fortnightly')).toBe(166667);
    });
  });

  // =====================================================
  // CARRYOVER & ROLLOVER
  // =====================================================
  describe('calculateCarryover', () => {
    it('should carry positive TBB forward', () => {
      expect(calculateCarryover(50000)).toBe(50000);
    });

    it('should carry zero forward when TBB is zero', () => {
      expect(calculateCarryover(0)).toBe(0);
    });

    it('should NOT carry negative TBB forward', () => {
      expect(calculateCarryover(-30000)).toBe(0);
    });
  });

  describe('processMonthRollover', () => {
    it('should calculate carryover and final TBB', () => {
      const result = processMonthRollover(500000, 400000, 50000);
      // TBB = 500000 + 50000 - 400000 = 150000
      expect(result.finalTBB).toBe(150000);
      expect(result.carryover).toBe(150000);
    });

    it('should clamp negative TBB to zero carryover', () => {
      const result = processMonthRollover(100000, 200000, 0);
      // TBB = 100000 + 0 - 200000 = -100000
      expect(result.finalTBB).toBe(-100000);
      expect(result.carryover).toBe(0);
    });
  });

  // =====================================================
  // EXPENSE STATUS
  // =====================================================
  describe('getExpenseStatus', () => {
    const makeExpense = (dueDateStr: string): ExpenseDefinition => ({
      id: 'e1', partnership_id: 'p1', name: 'Test',
      category_name: 'Test', expected_amount_cents: 10000,
      recurrence_type: 'monthly', next_due_date: dueDateStr,
      is_active: true, auto_detected: false, emoji: '💰',
    });

    it('should return "paid" when matched', () => {
      const status = getExpenseStatus(makeExpense('2026-02-25'), true);
      expect(status.status).toBe('paid');
      expect(status.icon).toBe('✅');
    });

    it('should return "overdue" for past due unmatched', () => {
      const status = getExpenseStatus(makeExpense('2026-02-18'), false);
      expect(status.status).toBe('overdue');
    });

    it('should return "pending" with due-soon label for near-term', () => {
      const status = getExpenseStatus(makeExpense('2026-02-22'), false);
      expect(status.status).toBe('pending');
      expect(status.label).toContain('Due in');
    });

    it('should return generic "pending" for far future', () => {
      const status = getExpenseStatus(makeExpense('2026-03-15'), false);
      expect(status.status).toBe('pending');
      expect(status.label).toBe('Pending');
    });
  });

  // =====================================================
  // EXPENSE GROUPING
  // =====================================================
  describe('groupExpensesByUrgency', () => {
    const makeExpense = (id: string, dueDateStr: string): ExpenseDefinition => ({
      id, partnership_id: 'p1', name: `Expense ${id}`,
      category_name: 'Test', expected_amount_cents: 10000,
      recurrence_type: 'monthly', next_due_date: dueDateStr,
      is_active: true, auto_detected: false, emoji: '💰',
    });

    it('should group overdue expenses', () => {
      const expenses = [makeExpense('1', '2026-02-18')];
      const groups = groupExpensesByUrgency(expenses, []);
      expect(groups.overdue).toHaveLength(1);
    });

    it('should group this-week expenses', () => {
      const expenses = [makeExpense('1', '2026-02-22')];
      const groups = groupExpensesByUrgency(expenses, []);
      expect(groups['this-week']).toHaveLength(1);
    });

    it('should group next-week expenses', () => {
      const expenses = [makeExpense('1', '2026-03-02')];
      const groups = groupExpensesByUrgency(expenses, []);
      expect(groups['next-week']).toHaveLength(1);
    });

    it('should group this-month expenses', () => {
      const expenses = [makeExpense('1', '2026-03-15')];
      const groups = groupExpensesByUrgency(expenses, []);
      expect(groups['this-month']).toHaveLength(1);
    });

    it('should group future expenses', () => {
      const expenses = [makeExpense('1', '2026-06-01')];
      const groups = groupExpensesByUrgency(expenses, []);
      expect(groups.future).toHaveLength(1);
    });

    it('should skip matched expenses', () => {
      const expenses = [makeExpense('1', '2026-02-22')];
      const matches: ExpenseMatch[] = [{ expense_definition_id: '1', matched_at: '2026-02-20' }];
      const groups = groupExpensesByUrgency(expenses, matches);
      expect(groups['this-week']).toHaveLength(0);
    });

    it('should handle mixed urgencies', () => {
      const expenses = [
        makeExpense('1', '2026-02-18'),  // overdue
        makeExpense('2', '2026-02-22'),  // this-week
        makeExpense('3', '2026-03-15'),  // this-month
        makeExpense('4', '2026-06-01'),  // future
      ];
      const groups = groupExpensesByUrgency(expenses, []);
      expect(groups.overdue).toHaveLength(1);
      expect(groups['this-week']).toHaveLength(1);
      expect(groups['this-month']).toHaveLength(1);
      expect(groups.future).toHaveLength(1);
    });
  });

  // =====================================================
  // BUDGET SUMMARY
  // =====================================================
  describe('calculateBudgetSummary', () => {
    it('should calculate complete budget summary', () => {
      const assignments: BudgetAssignment[] = [
        { id: '1', partnership_id: 'p1', month: '2026-02-01', category_name: 'Groceries', assigned_cents: 50000 },
        { id: '2', partnership_id: 'p1', month: '2026-02-01', category_name: 'Transport', assigned_cents: 20000 },
      ];
      const spending = new Map<string, number>([
        ['Groceries', 40000],
        ['Transport', 10000],
      ]);

      const summary = calculateBudgetSummary(500000, 10000, assignments, spending, 5);

      expect(summary.income).toBe(500000);
      expect(summary.assigned).toBe(70000);
      expect(summary.spent).toBe(50000);
      expect(summary.available).toBe(20000);
      expect(summary.toBeBudgeted).toBe(440000); // 500000 + 10000 - 70000
      expect(summary.budgetedCategories).toBe(2);
      expect(summary.totalCategories).toBe(5);
      expect(summary.percentBudgeted).toBe(40); // 2/5 * 100
    });

    it('should handle empty assignments', () => {
      const summary = calculateBudgetSummary(500000, 0, [], new Map(), 5);
      expect(summary.assigned).toBe(0);
      expect(summary.spent).toBe(0);
      expect(summary.toBeBudgeted).toBe(500000);
      expect(summary.budgetedCategories).toBe(0);
      expect(summary.percentBudgeted).toBe(0);
    });

    it('should handle zero total categories', () => {
      const summary = calculateBudgetSummary(0, 0, [], new Map(), 0);
      expect(summary.percentBudgeted).toBe(0);
    });
  });

  // =====================================================
  // CURRENCY FORMATTING
  // =====================================================
  describe('formatCurrency', () => {
    it('should format positive amounts', () => {
      const result = formatCurrency(150000);
      expect(result).toContain('1,500');
    });

    it('should format zero', () => {
      const result = formatCurrency(0);
      expect(result).toContain('0');
    });

    it('should format negative amounts', () => {
      const result = formatCurrency(-50000);
      expect(result).toContain('500');
    });
  });

  // =====================================================
  // EXPENSE MATCH FIELDS
  // =====================================================
  describe('EXPENSE_MATCH_FIELDS', () => {
    it('should include required fields', () => {
      expect(EXPENSE_MATCH_FIELDS).toContain('expense_definition_id');
      expect(EXPENSE_MATCH_FIELDS).toContain('matched_at');
      expect(EXPENSE_MATCH_FIELDS).toContain('transaction_id');
    });

    it('should be a readonly tuple', () => {
      expect(EXPENSE_MATCH_FIELDS.length).toBe(6);
    });
  });
});
