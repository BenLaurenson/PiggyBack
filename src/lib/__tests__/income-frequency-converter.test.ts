import { describe, it, expect } from 'vitest';
import { convertIncomeFrequency } from '@/lib/income-frequency-converter';

/**
 * Tests for Issue 29 — Income frequency approximation
 *
 * The converter intentionally uses 4 weeks = 1 month (not 4.33).
 * This ~1.3% annual variance is acceptable for UX simplicity.
 */

describe('income frequency converter — Issue 29', () => {
  it('should use 4-week approximation for weekly to monthly (1000 weekly = 4000 monthly, not 4330)', () => {
    const result = convertIncomeFrequency(1000, 'weekly', 'monthly');
    // 4 weeks = 1 month approximation: 1000 * 4 = 4000
    // NOT the precise 52/12 = 4.333... which would give 4333
    expect(result).toBe(4000);
  });

  it('should use 2-fortnight approximation for fortnightly to monthly', () => {
    const result = convertIncomeFrequency(2778, 'fortnightly', 'monthly');
    // 2 fortnights = 1 month: 2778 * 2 = 5556
    expect(result).toBe(5556);
  });

  it('should round-trip weekly through monthly and back', () => {
    const weeklyAmount = 500;
    const monthly = convertIncomeFrequency(weeklyAmount, 'weekly', 'monthly');
    const backToWeekly = convertIncomeFrequency(monthly, 'monthly', 'weekly');
    // 500 * 4 = 2000, 2000 / 4 = 500 — exact round trip
    expect(backToWeekly).toBe(weeklyAmount);
  });
});
