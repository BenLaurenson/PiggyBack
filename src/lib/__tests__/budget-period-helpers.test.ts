import { describe, it, expect } from 'vitest';
import {
  getPeriodStartDate,
  getPeriodEndDate,
  getCurrentPeriodBoundaries,
  prorateBudgetForPeriod,
  TIME_SYSTEM as BUDGET_TIME_SYSTEM,
} from '../budget-period-helpers';
import {
  calculatePeriodStart,
  TIME_SYSTEM as EXPENSE_TIME_SYSTEM,
} from '../expense-period-utils';

describe('budget-period-helpers', () => {
  describe('getPeriodStartDate', () => {
    describe('monthly periods', () => {
      it('should return first day of month for monthly periods', () => {
        const date = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
        const start = getPeriodStartDate(date, 'monthly');

        expect(start.getUTCFullYear()).toBe(2026);
        expect(start.getUTCMonth()).toBe(0); // January
        expect(start.getUTCDate()).toBe(1);
        expect(start.getUTCHours()).toBe(0);
      });

      it('should handle end of month dates', () => {
        const date = new Date(Date.UTC(2026, 0, 31)); // Jan 31, 2026
        const start = getPeriodStartDate(date, 'monthly');

        expect(start.getUTCDate()).toBe(1);
        expect(start.getUTCMonth()).toBe(0);
      });
    });

    describe('weekly periods (month-aligned)', () => {
      it('should return day 1 for days 1-7', () => {
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 1)), 'weekly').getUTCDate()).toBe(1);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 5)), 'weekly').getUTCDate()).toBe(1);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 7)), 'weekly').getUTCDate()).toBe(1);
      });

      it('should return day 8 for days 8-14', () => {
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 8)), 'weekly').getUTCDate()).toBe(8);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 10)), 'weekly').getUTCDate()).toBe(8);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 14)), 'weekly').getUTCDate()).toBe(8);
      });

      it('should return day 15 for days 15-21', () => {
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 15)), 'weekly').getUTCDate()).toBe(15);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 18)), 'weekly').getUTCDate()).toBe(15);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 21)), 'weekly').getUTCDate()).toBe(15);
      });

      it('should return day 22 for days 22+', () => {
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 22)), 'weekly').getUTCDate()).toBe(22);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 25)), 'weekly').getUTCDate()).toBe(22);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 31)), 'weekly').getUTCDate()).toBe(22);
      });
    });

    describe('fortnightly periods (month-aligned)', () => {
      it('should return day 1 for days 1-14', () => {
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 1)), 'fortnightly').getUTCDate()).toBe(1);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 7)), 'fortnightly').getUTCDate()).toBe(1);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 14)), 'fortnightly').getUTCDate()).toBe(1);
      });

      it('should return day 15 for days 15+', () => {
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 15)), 'fortnightly').getUTCDate()).toBe(15);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 22)), 'fortnightly').getUTCDate()).toBe(15);
        expect(getPeriodStartDate(new Date(Date.UTC(2026, 0, 31)), 'fortnightly').getUTCDate()).toBe(15);
      });
    });
  });

  describe('getPeriodEndDate', () => {
    describe('monthly periods', () => {
      it('should return last day of month for monthly periods', () => {
        const date = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
        const end = getPeriodEndDate(date, 'monthly');

        expect(end.getUTCFullYear()).toBe(2026);
        expect(end.getUTCMonth()).toBe(0); // January
        expect(end.getUTCDate()).toBe(31);
        expect(end.getUTCHours()).toBe(23);
        expect(end.getUTCMinutes()).toBe(59);
        expect(end.getUTCSeconds()).toBe(59);
      });

      it('should handle February correctly', () => {
        const date = new Date(Date.UTC(2026, 1, 15)); // Feb 15, 2026
        const end = getPeriodEndDate(date, 'monthly');

        expect(end.getUTCDate()).toBe(28); // 2026 is not a leap year
      });

      it('should handle leap years correctly', () => {
        const date = new Date(Date.UTC(2024, 1, 15)); // Feb 15, 2024
        const end = getPeriodEndDate(date, 'monthly');

        expect(end.getUTCDate()).toBe(29); // 2024 is a leap year
      });
    });

    describe('weekly periods (month-aligned)', () => {
      it('should return day 7 for week 1', () => {
        const end = getPeriodEndDate(new Date(Date.UTC(2026, 0, 5)), 'weekly');
        expect(end.getUTCDate()).toBe(7);
        expect(end.getUTCHours()).toBe(23);
      });

      it('should return day 14 for week 2', () => {
        const end = getPeriodEndDate(new Date(Date.UTC(2026, 0, 10)), 'weekly');
        expect(end.getUTCDate()).toBe(14);
      });

      it('should return day 21 for week 3', () => {
        const end = getPeriodEndDate(new Date(Date.UTC(2026, 0, 18)), 'weekly');
        expect(end.getUTCDate()).toBe(21);
      });

      it('should return end of month for week 4', () => {
        const end = getPeriodEndDate(new Date(Date.UTC(2026, 0, 25)), 'weekly');
        expect(end.getUTCDate()).toBe(31); // End of January
      });

      it('should return correct end of month for February', () => {
        const end = getPeriodEndDate(new Date(Date.UTC(2026, 1, 22)), 'weekly');
        expect(end.getUTCDate()).toBe(28); // End of February 2026
      });
    });

    describe('fortnightly periods (month-aligned)', () => {
      it('should return day 14 for first fortnight', () => {
        const end = getPeriodEndDate(new Date(Date.UTC(2026, 0, 5)), 'fortnightly');
        expect(end.getUTCDate()).toBe(14);
        expect(end.getUTCHours()).toBe(23);
      });

      it('should return end of month for second fortnight', () => {
        const end = getPeriodEndDate(new Date(Date.UTC(2026, 0, 20)), 'fortnightly');
        expect(end.getUTCDate()).toBe(31); // End of January
      });
    });
  });

  describe('getCurrentPeriodBoundaries', () => {
    it('should return correct boundaries for monthly period', () => {
      const date = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
      const boundaries = getCurrentPeriodBoundaries(date, 'monthly');

      expect(boundaries.start.getUTCDate()).toBe(1);
      expect(boundaries.end.getUTCDate()).toBe(31);
      expect(boundaries.label).toContain('January');
    });

    it('should return correct boundaries for weekly period', () => {
      const date = new Date(Date.UTC(2026, 0, 10)); // Jan 10, 2026
      const boundaries = getCurrentPeriodBoundaries(date, 'weekly');

      expect(boundaries.start.getUTCDate()).toBe(8);
      expect(boundaries.end.getUTCDate()).toBe(14);
      expect(boundaries.label).toContain('Week');
    });
  });

  describe('prorateBudgetForPeriod', () => {
    const monthlyAmount = 1000;

    it('should return full amount for monthly', () => {
      expect(prorateBudgetForPeriod(monthlyAmount, 'monthly')).toBe(1000);
    });

    it('should return half for fortnightly', () => {
      expect(prorateBudgetForPeriod(monthlyAmount, 'fortnightly')).toBe(500);
    });

    it('should return quarter for weekly', () => {
      expect(prorateBudgetForPeriod(monthlyAmount, 'weekly')).toBe(250);
    });

    it('should handle rounding correctly', () => {
      expect(prorateBudgetForPeriod(1001, 'weekly')).toBe(250);
      expect(prorateBudgetForPeriod(999, 'weekly')).toBe(250);
    });
  });

  // These are the CRITICAL tests for the bug
  describe('period boundary comparisons', () => {
    it('should produce consistent UTC dates for start and end', () => {
      const date = new Date(Date.UTC(2026, 0, 10)); // Jan 10, 2026
      const start = getPeriodStartDate(date, 'monthly');
      const end = getPeriodEndDate(date, 'monthly');

      // Both should have UTC times (verify via ISO string)
      expect(start.toISOString()).toMatch(/T00:00:00\.000Z$/);
      expect(end.toISOString()).toMatch(/T23:59:59\.999Z$/);
    });

    it('for_period date should fall within period boundaries when parsed as UTC', () => {
      // Simulate what the database returns: for_period = '2026-01-01' (ISO date string)
      const forPeriod = '2026-01-01';

      // This is how we currently parse it in generatePaidInstances
      const forPeriodDate = new Date(forPeriod + 'T00:00:00Z');

      const periodStart = getPeriodStartDate(new Date(Date.UTC(2026, 0, 10)), 'monthly');
      const periodEnd = getPeriodEndDate(new Date(Date.UTC(2026, 0, 10)), 'monthly');

      console.log('forPeriodDate:', forPeriodDate.toISOString());
      console.log('periodStart:', periodStart.toISOString());
      console.log('periodEnd:', periodEnd.toISOString());

      // forPeriodDate should be >= periodStart and <= periodEnd
      expect(forPeriodDate.getTime()).toBeGreaterThanOrEqual(periodStart.getTime());
      expect(forPeriodDate.getTime()).toBeLessThanOrEqual(periodEnd.getTime());
    });

    it('January payment should show in January period', () => {
      // Real scenario: Rent paid on Jan 1st
      const forPeriod = '2026-01-01';
      const forPeriodDate = new Date(forPeriod + 'T00:00:00Z');

      // January 2026 period
      const periodStart = getPeriodStartDate(new Date(Date.UTC(2026, 0, 15)), 'monthly');
      const periodEnd = getPeriodEndDate(new Date(Date.UTC(2026, 0, 15)), 'monthly');

      const isInPeriod = forPeriodDate >= periodStart && forPeriodDate <= periodEnd;
      expect(isInPeriod).toBe(true);
    });

    it('December payment should NOT show in January period', () => {
      const forPeriod = '2025-12-01';
      const forPeriodDate = new Date(forPeriod + 'T00:00:00Z');

      // January 2026 period
      const periodStart = getPeriodStartDate(new Date(Date.UTC(2026, 0, 15)), 'monthly');
      const periodEnd = getPeriodEndDate(new Date(Date.UTC(2026, 0, 15)), 'monthly');

      const isInPeriod = forPeriodDate >= periodStart && forPeriodDate <= periodEnd;
      expect(isInPeriod).toBe(false);
    });

    it('weekly period boundaries should work correctly', () => {
      // Payment for_period of Jan 8 (week 2)
      const forPeriod = '2026-01-08';
      const forPeriodDate = new Date(forPeriod + 'T00:00:00Z');

      // Week 2 of January (Jan 8-14)
      const periodStart = getPeriodStartDate(new Date(Date.UTC(2026, 0, 10)), 'weekly');
      const periodEnd = getPeriodEndDate(new Date(Date.UTC(2026, 0, 10)), 'weekly');

      console.log('Weekly period:');
      console.log('forPeriodDate:', forPeriodDate.toISOString());
      console.log('periodStart:', periodStart.toISOString());
      console.log('periodEnd:', periodEnd.toISOString());

      const isInPeriod = forPeriodDate >= periodStart && forPeriodDate <= periodEnd;
      expect(isInPeriod).toBe(true);
    });
  });

  /**
   * Issue 15 — Documenting the intentional time system difference
   *
   * expense-period-utils uses LOCAL time with Monday-based weeks because it
   * calculates billing periods from transaction dates (which users see in local time).
   *
   * budget-period-helpers uses UTC with month-aligned periods because it
   * calculates budget period boundaries that are stored and compared in UTC.
   *
   * These are DIFFERENT systems by design and must NOT be unified.
   */
  describe('Issue 15 — intentional time system differences', () => {
    it('should export TIME_SYSTEM metadata from budget-period-helpers', () => {
      expect(BUDGET_TIME_SYSTEM).toBeDefined();
      expect(BUDGET_TIME_SYSTEM.timezone).toBe('user');
      expect(BUDGET_TIME_SYSTEM.weekSystem).toBe('month-aligned');
    });

    it('should export TIME_SYSTEM metadata from expense-period-utils', () => {
      expect(EXPENSE_TIME_SYSTEM).toBeDefined();
      expect(EXPENSE_TIME_SYSTEM.timezone).toBe('local');
      expect(EXPENSE_TIME_SYSTEM.weekSystem).toBe('monday-based');
    });

    it('budget-period-helpers weekly periods are month-aligned (1-7, 8-14, 15-21, 22-end)', () => {
      // A Wednesday Jan 8 (a Thursday in AU) falls in the 8-14 bucket
      const date = new Date(Date.UTC(2026, 0, 8));
      const start = getPeriodStartDate(date, 'weekly');
      expect(start.getUTCDate()).toBe(8); // month-aligned: day 8 starts week 2
    });

    it('expense-period-utils weekly periods are Monday-based (ISO weeks)', () => {
      // Jan 8 2026 is a Thursday. Monday of that week is Jan 5
      const date = new Date(2026, 0, 8); // Local time
      const start = calculatePeriodStart(date, 'weekly');
      expect(start.getDate()).toBe(5); // Monday-based: Monday Jan 5
    });

    it('the two systems produce different week start dates for the same day (by design)', () => {
      // Jan 8 2026 — budget-period-helpers says week starts on the 8th (month-aligned)
      //              expense-period-utils says week starts on the 5th (Monday-based)
      const budgetStart = getPeriodStartDate(new Date(Date.UTC(2026, 0, 8)), 'weekly');
      const expenseStart = calculatePeriodStart(new Date(2026, 0, 8), 'weekly');

      // Budget: month-aligned week 2 starts on the 8th
      expect(budgetStart.getUTCDate()).toBe(8);
      // Expense: ISO Monday-based week starts on the 5th
      expect(expenseStart.getDate()).toBe(5);

      // They are intentionally different
      expect(budgetStart.getUTCDate()).not.toBe(expenseStart.getDate());
    });
  });
});
