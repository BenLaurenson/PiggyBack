import { describe, it, expect } from 'vitest';
import {
  calculatePeriodStart,
  formatPeriodDate,
  getPeriodForTransaction,
  isTransactionInPeriod,
  getPeriodLabel,
} from '../expense-period-utils';

describe('expense-period-utils', () => {
  describe('calculatePeriodStart', () => {
    describe('monthly recurrence', () => {
      it('should return first day of month', () => {
        const result = calculatePeriodStart('2026-01-15', 'monthly');
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0); // January
        expect(result.getDate()).toBe(1);
      });

      it('should handle date string input', () => {
        const result = calculatePeriodStart('2026-01-15T10:30:00Z', 'monthly');
        expect(result.getDate()).toBe(1);
      });

      it('should handle Date object input', () => {
        const date = new Date(2026, 0, 15);
        const result = calculatePeriodStart(date, 'monthly');
        expect(result.getDate()).toBe(1);
      });
    });

    describe('weekly recurrence', () => {
      it('should return Monday for mid-week date', () => {
        // Jan 15, 2026 is a Thursday
        const result = calculatePeriodStart('2026-01-15', 'weekly');
        expect(result.getDate()).toBe(12); // Monday Jan 12
      });

      it('should return same day for Monday', () => {
        // Jan 12, 2026 is a Monday
        const result = calculatePeriodStart('2026-01-12', 'weekly');
        expect(result.getDate()).toBe(12);
      });

      it('should handle Sunday (goes to previous Monday)', () => {
        // Jan 11, 2026 is a Sunday
        const result = calculatePeriodStart('2026-01-11', 'weekly');
        expect(result.getDate()).toBe(5); // Monday Jan 5
      });
    });

    describe('quarterly recurrence', () => {
      it('should return first day of quarter for Q1', () => {
        const result = calculatePeriodStart('2026-02-15', 'quarterly');
        expect(result.getMonth()).toBe(0); // January
        expect(result.getDate()).toBe(1);
      });

      it('should return first day of quarter for Q2', () => {
        const result = calculatePeriodStart('2026-05-15', 'quarterly');
        expect(result.getMonth()).toBe(3); // April
        expect(result.getDate()).toBe(1);
      });

      it('should return first day of quarter for Q3', () => {
        const result = calculatePeriodStart('2026-08-15', 'quarterly');
        expect(result.getMonth()).toBe(6); // July
        expect(result.getDate()).toBe(1);
      });

      it('should return first day of quarter for Q4', () => {
        const result = calculatePeriodStart('2026-11-15', 'quarterly');
        expect(result.getMonth()).toBe(9); // October
        expect(result.getDate()).toBe(1);
      });
    });

    describe('yearly recurrence', () => {
      it('should return first day of year', () => {
        const result = calculatePeriodStart('2026-06-15', 'yearly');
        expect(result.getMonth()).toBe(0); // January
        expect(result.getDate()).toBe(1);
        expect(result.getFullYear()).toBe(2026);
      });
    });

    describe('one-time recurrence', () => {
      it('should return first day of month containing the date', () => {
        const result = calculatePeriodStart('2026-03-15', 'one-time');
        expect(result.getMonth()).toBe(2); // March
        expect(result.getDate()).toBe(1);
      });
    });
  });

  describe('formatPeriodDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date(2026, 0, 15);
      const result = formatPeriodDate(date);
      expect(result).toBe('2026-01-15');
    });

    it('should handle single digit months and days', () => {
      const date = new Date(2026, 0, 5);
      const result = formatPeriodDate(date);
      expect(result).toBe('2026-01-05');
    });
  });

  describe('getPeriodForTransaction', () => {
    it('should return ISO date string for monthly expense', () => {
      const result = getPeriodForTransaction('2026-01-15', 'monthly');
      expect(result).toBe('2026-01-01');
    });

    it('should return ISO date string for weekly expense', () => {
      // Jan 15, 2026 is Thursday, period starts Monday Jan 12
      const result = getPeriodForTransaction('2026-01-15', 'weekly');
      expect(result).toBe('2026-01-12');
    });

    it('should return ISO date string for quarterly expense', () => {
      // Feb 15 is in Q1, which starts Jan 1
      const result = getPeriodForTransaction('2026-02-15', 'quarterly');
      expect(result).toBe('2026-01-01');
    });
  });

  describe('isTransactionInPeriod', () => {
    const periodStart = new Date(Date.UTC(2026, 0, 1));
    const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

    it('should return true for transaction within period', () => {
      expect(isTransactionInPeriod('2026-01-15', periodStart, periodEnd)).toBe(true);
    });

    it('should return true for transaction on period start', () => {
      expect(isTransactionInPeriod('2026-01-01', periodStart, periodEnd)).toBe(true);
    });

    it('should return true for transaction on period end', () => {
      expect(isTransactionInPeriod('2026-01-31', periodStart, periodEnd)).toBe(true);
    });

    it('should return false for transaction before period', () => {
      expect(isTransactionInPeriod('2025-12-31', periodStart, periodEnd)).toBe(false);
    });

    it('should return false for transaction after period', () => {
      expect(isTransactionInPeriod('2026-02-01', periodStart, periodEnd)).toBe(false);
    });
  });

  describe('getPeriodLabel', () => {
    it('should format monthly period', () => {
      const date = new Date(2026, 0, 1);
      const label = getPeriodLabel(date, 'monthly');
      expect(label).toContain('January');
      expect(label).toContain('2026');
    });

    it('should format weekly period', () => {
      const date = new Date(2026, 0, 5);
      const label = getPeriodLabel(date, 'weekly');
      expect(label).toContain('Week');
    });

    it('should format quarterly period', () => {
      const date = new Date(2026, 0, 1);
      const label = getPeriodLabel(date, 'quarterly');
      expect(label).toContain('Q1');
      expect(label).toContain('2026');
    });

    it('should format yearly period', () => {
      const date = new Date(2026, 0, 1);
      const label = getPeriodLabel(date, 'yearly');
      expect(label).toBe('2026');
    });
  });

  // CRITICAL: Test the mismatch between budget-period-helpers and expense-period-utils
  describe('period calculation consistency', () => {
    it('monthly: transaction period should align with budget period for same month', () => {
      // Transaction on Jan 1, 2026
      const txnForPeriod = getPeriodForTransaction('2026-01-01', 'monthly');

      // Budget period for January 2026 (from budget-period-helpers uses UTC)
      // Simulating what getPeriodStartDate returns: 2026-01-01T00:00:00.000Z
      // The txnForPeriod will be '2026-01-01'

      // When we parse txnForPeriod in generatePaidInstances:
      const parsedPeriod = new Date(txnForPeriod + 'T00:00:00Z');

      // Budget period boundaries
      const budgetStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      const budgetEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

      expect(parsedPeriod.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(parsedPeriod >= budgetStart).toBe(true);
      expect(parsedPeriod <= budgetEnd).toBe(true);
    });

    it('ISSUE: expense-period-utils uses LOCAL time, not UTC', () => {
      // calculatePeriodStart creates dates using local time
      // This can cause timezone issues!

      // If we call with a UTC timestamp, the result may be in local time
      const utcDate = new Date(Date.UTC(2026, 0, 1, 2, 0, 0)); // 2am UTC on Jan 1

      // In Perth (UTC+8), this is 10am Jan 1 local time
      // But for US West (UTC-8), this is 6pm Dec 31 local time!

      const period = calculatePeriodStart(utcDate, 'monthly');

      // Let's see what we actually get
      console.log('Input date (UTC):', utcDate.toISOString());
      console.log('Input date (local):', utcDate.toString());
      console.log('Period start (ISO):', period.toISOString());
      console.log('Period start (local):', period.toString());
      console.log('Period start date:', period.getDate());
      console.log('Period start month:', period.getMonth());

      // The period start should be Jan 1 regardless of timezone
      // BUT if user is in a timezone behind UTC, this could fail!
      expect(period.getDate()).toBe(1);
    });
  });
});
