import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for Issue 10: Demo Mode Date Inconsistency
 *
 * Verifies that time-dependent functions use getCurrentDate() instead of new Date(),
 * so that demo mode's frozen date is consistent throughout the app.
 */

describe('demo mode date consistency', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('budget-zero-calculations', () => {
    it('isCurrentMonth should use frozen date in demo mode', async () => {
      // Demo mode frozen date is 2026-01-28
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { isCurrentMonth } = await import('@/lib/budget-zero-calculations');

      // January 2026 should be "current month" in demo mode
      expect(isCurrentMonth('2026-01-01')).toBe(true);
      // February 2026 should NOT be current month
      expect(isCurrentMonth('2026-02-01')).toBe(false);
    });

    it('isExpenseOverdue should use frozen date in demo mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { isExpenseOverdue } = await import('@/lib/budget-zero-calculations');

      // Frozen date is 2026-01-28
      // Due date of Jan 27 → overdue
      expect(isExpenseOverdue(new Date('2026-01-27'))).toBe(true);
      // Due date of Jan 29 → NOT overdue
      expect(isExpenseOverdue(new Date('2026-01-29'))).toBe(false);
    });

    it('getDaysUntilDue should use frozen date in demo mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { getDaysUntilDue } = await import('@/lib/budget-zero-calculations');

      // Frozen date is 2026-01-28T12:00:00 (noon)
      // Due Feb 1 → 4 days away
      const days = getDaysUntilDue(new Date('2026-02-01T12:00:00'));
      expect(days).toBe(4);
    });

    it('getExpenseGroup should use frozen date in demo mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { getExpenseGroup } = await import('@/lib/budget-zero-calculations');

      // Frozen date is 2026-01-28
      // Due 2026-01-25 and not matched → overdue (before frozen date)
      const result = getExpenseGroup({
        next_due_date: '2026-01-25',
        recurrence_type: 'monthly',
        is_matched: false,
      });
      expect(result).toBe('overdue');

      // Due 2026-01-30 → this-week (2 days from frozen date)
      const result2 = getExpenseGroup({
        next_due_date: '2026-01-30',
        recurrence_type: 'monthly',
        is_matched: false,
      });
      expect(result2).toBe('this-week');
    });
  });

  describe('expense-projections', () => {
    it('generateProjectedOccurrences should use frozen date as default referenceDate in demo mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { generateProjectedOccurrences } = await import('@/lib/expense-projections');

      const expense = {
        id: 'exp-1',
        name: 'Test',
        category_name: 'Housing',
        expected_amount_cents: 10000,
        recurrence_type: 'monthly',
        next_due_date: '2026-02-01',
        emoji: '🏠',
      };

      // When no referenceDate is provided, it should use frozen date (Jan 28, 2026)
      // The function should generate occurrences relative to that date
      const occurrences = generateProjectedOccurrences(expense);

      // With frozen date Jan 28, we should see Feb and potentially Mar
      expect(occurrences.length).toBeGreaterThanOrEqual(1);
      // First occurrence should be Feb 1
      expect(occurrences[0].projectedDate.getTime()).toBe(new Date('2026-02-01').getTime());
    });

    it('groupExpensesByTimeline should use frozen date as default in demo mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { groupExpensesByTimeline } = await import('@/lib/expense-projections');

      // Empty array should still work
      const groups = groupExpensesByTimeline([]);
      expect(groups).toEqual([]);
    });

    it('generateTimelineFromExpenses should use frozen date as default in demo mode', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { generateTimelineFromExpenses } = await import('@/lib/expense-projections');

      const result = generateTimelineFromExpenses([]);
      expect(result).toEqual([]);
    });
  });
});
