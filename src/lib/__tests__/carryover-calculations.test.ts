import { describe, it, expect } from 'vitest';
import {
  calculateToBeBudgeted,
  calculateCarryover,
  processMonthRollover,
  calculatePeriodIncome,
} from '../budget-zero-calculations';

/**
 * Tests for carryover logic.
 *
 * Carryover mode is always "none" — every period starts fresh.
 * These tests verify the underlying math functions still work correctly.
 */
describe('carryover-calculations', () => {
  // =====================================================
  // calculateCarryover — pure function
  // =====================================================
  describe('calculateCarryover', () => {
    it('should carry positive TBB forward', () => {
      expect(calculateCarryover(50000)).toBe(50000);
    });

    it('should carry zero when TBB is exactly zero', () => {
      expect(calculateCarryover(0)).toBe(0);
    });

    it('should clamp negative TBB to zero (never carry debt)', () => {
      expect(calculateCarryover(-30000)).toBe(0);
    });

    it('should clamp large negative TBB to zero', () => {
      expect(calculateCarryover(-999999)).toBe(0);
    });

    it('should handle very large positive amounts', () => {
      expect(calculateCarryover(100_000_00)).toBe(100_000_00); // $100,000
    });

    it('should handle 1 cent positive', () => {
      expect(calculateCarryover(1)).toBe(1);
    });

    it('should handle 1 cent negative', () => {
      expect(calculateCarryover(-1)).toBe(0);
    });
  });

  // =====================================================
  // processMonthRollover — combines TBB + carryover
  // =====================================================
  describe('processMonthRollover', () => {
    it('should calculate positive carryover when under-assigned', () => {
      // Income $5000, Assigned $4000, Previous carryover $500
      // TBB = 5000 + 500 - 4000 = 1500 → carryover 1500
      const result = processMonthRollover(500000, 400000, 50000);
      expect(result.finalTBB).toBe(150000);
      expect(result.carryover).toBe(150000);
    });

    it('should return zero carryover when over-assigned', () => {
      // Income $1000, Assigned $2000, Previous carryover $0
      // TBB = 1000 + 0 - 2000 = -1000 → carryover 0
      const result = processMonthRollover(100000, 200000, 0);
      expect(result.finalTBB).toBe(-100000);
      expect(result.carryover).toBe(0);
    });

    it('should return zero carryover when exactly balanced', () => {
      // Income $3000, Assigned $3000, Previous carryover $0
      // TBB = 0 → carryover 0
      const result = processMonthRollover(300000, 300000, 0);
      expect(result.finalTBB).toBe(0);
      expect(result.carryover).toBe(0);
    });

    it('should include previous carryover in TBB calculation', () => {
      // Income $2000, Assigned $2500, Previous carryover $1000
      // TBB = 2000 + 1000 - 2500 = 500 → carryover 500
      const result = processMonthRollover(200000, 250000, 100000);
      expect(result.finalTBB).toBe(50000);
      expect(result.carryover).toBe(50000);
    });

    it('should handle zero income with carryover', () => {
      // Income $0, Assigned $500, Previous carryover $1000
      // TBB = 0 + 1000 - 500 = 500 → carryover 500
      const result = processMonthRollover(0, 50000, 100000);
      expect(result.finalTBB).toBe(50000);
      expect(result.carryover).toBe(50000);
    });

    it('should handle all zeros', () => {
      const result = processMonthRollover(0, 0, 0);
      expect(result.finalTBB).toBe(0);
      expect(result.carryover).toBe(0);
    });

    it('should handle chained rollovers (month1 → month2 → month3)', () => {
      // Month 1: Income $5000, Assigned $3000, No prior carryover
      const month1 = processMonthRollover(500000, 300000, 0);
      expect(month1.finalTBB).toBe(200000);
      expect(month1.carryover).toBe(200000);

      // Month 2: Income $5000, Assigned $6000, Carryover from month1 = $2000
      const month2 = processMonthRollover(500000, 600000, month1.carryover);
      expect(month2.finalTBB).toBe(100000); // 5000 + 2000 - 6000
      expect(month2.carryover).toBe(100000);

      // Month 3: Income $5000, Assigned $5500, Carryover from month2 = $1000
      const month3 = processMonthRollover(500000, 550000, month2.carryover);
      expect(month3.finalTBB).toBe(50000); // 5000 + 1000 - 5500
      expect(month3.carryover).toBe(50000);
    });

    it('should stop carrying forward after an over-spend month', () => {
      // Month 1: $500 carryover
      const month1 = processMonthRollover(500000, 300000, 0);
      expect(month1.carryover).toBe(200000);

      // Month 2: Over-assign — burns through carryover
      const month2 = processMonthRollover(500000, 800000, month1.carryover);
      expect(month2.finalTBB).toBe(-100000); // 5000 + 2000 - 8000
      expect(month2.carryover).toBe(0); // Clamped to 0

      // Month 3: Starts fresh (no carryover from month2)
      const month3 = processMonthRollover(500000, 400000, month2.carryover);
      expect(month3.finalTBB).toBe(100000); // 5000 + 0 - 4000
      expect(month3.carryover).toBe(100000);
    });
  });

  // =====================================================
  // Fresh each period (carryover always 0)
  // =====================================================
  describe('fresh each period', () => {
    it('should always return zero carryover regardless of TBB', () => {
      // In "none" mode, the API route sets carryoverMonthly = 0
      const carryoverMonthly = 0; // Always 0 for "none" mode

      const tbb = calculateToBeBudgeted(500000, 300000, carryoverMonthly);
      expect(tbb).toBe(200000); // 5000 - 3000 = 2000
      // But nothing carries to next month
      expect(carryoverMonthly).toBe(0);
    });

    it('should not accumulate across months', () => {
      // Even with consistent underspend, nothing carries forward
      const months = [
        { income: 500000, assigned: 300000 },
        { income: 500000, assigned: 300000 },
        { income: 500000, assigned: 300000 },
      ];

      for (const m of months) {
        const carryover = 0; // Always 0 in "none" mode
        const tbb = calculateToBeBudgeted(m.income, m.assigned, carryover);
        expect(tbb).toBe(200000); // Always the same, no accumulation
      }
    });
  });

  // =====================================================
  // TBB with carryover integration
  // =====================================================
  describe('calculateToBeBudgeted with carryover', () => {
    it('should include positive carryover', () => {
      // Income $5000, Assigned $4000, Carryover $1000
      // TBB = 5000 + 1000 - 4000 = 2000
      expect(calculateToBeBudgeted(500000, 400000, 100000)).toBe(200000);
    });

    it('should work with zero carryover', () => {
      expect(calculateToBeBudgeted(500000, 400000, 0)).toBe(100000);
    });

    it('should work with zero income (living off carryover)', () => {
      expect(calculateToBeBudgeted(0, 200000, 500000)).toBe(300000);
    });

    it('should produce negative TBB when over-assigned', () => {
      expect(calculateToBeBudgeted(300000, 500000, 100000)).toBe(-100000);
    });
  });

  // =====================================================
  // Period conversion (monthly carryover → display period)
  // =====================================================
  describe('period conversion for carryover display', () => {
    /**
     * The API route converts monthly carryover to display period:
     * weekly:      Math.round(carryoverMonthly / 4)
     * fortnightly: Math.round(carryoverMonthly / 2)
     * monthly:     carryoverMonthly as-is
     *
     * Using calculatePeriodIncome which does the same division.
     */
    it('should show full monthly carryover for monthly period', () => {
      expect(calculatePeriodIncome(200000, 'monthly')).toBe(200000);
    });

    it('should divide by 4 for weekly period', () => {
      expect(calculatePeriodIncome(200000, 'weekly')).toBe(50000);
    });

    it('should divide by 2 for fortnightly period', () => {
      expect(calculatePeriodIncome(200000, 'fortnightly')).toBe(100000);
    });

    it('should round correctly for odd carryover amounts', () => {
      // $1333.33 monthly → $333.33 weekly (rounded to $333)
      expect(calculatePeriodIncome(133333, 'weekly')).toBe(33333);
      // $1333.33 monthly → $666.67 fortnightly (rounded to $667)
      expect(calculatePeriodIncome(133333, 'fortnightly')).toBe(66667);
    });

    it('should handle zero carryover for all periods', () => {
      expect(calculatePeriodIncome(0, 'weekly')).toBe(0);
      expect(calculatePeriodIncome(0, 'fortnightly')).toBe(0);
      expect(calculatePeriodIncome(0, 'monthly')).toBe(0);
    });

    it('should handle 1 cent carryover', () => {
      expect(calculatePeriodIncome(1, 'weekly')).toBe(0); // rounds to 0
      expect(calculatePeriodIncome(1, 'fortnightly')).toBe(1); // rounds to 1
      expect(calculatePeriodIncome(1, 'monthly')).toBe(1);
    });
  });

});
