/**
 * Income Frequency Converter
 * Converts income amounts FROM their stored frequency TO any display period
 *
 * Uses INTUITIVE multipliers that match user expectations:
 * - Weekly × 4 = Monthly (not 4.33)
 * - Fortnightly × 2 = Monthly (not 2.17)
 * - Quarterly ÷ 3 = Monthly
 * - Yearly ÷ 12 = Monthly
 *
 * This matches how users think about their income:
 * "I get paid $2,778 fortnightly, so monthly is $5,556"
 */

export type IncomeFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';
export type DisplayPeriod = 'weekly' | 'fortnightly' | 'monthly';

/**
 * Convert income amount FROM its stored frequency TO monthly equivalent.
 *
 * Uses intuitive multipliers (4 weeks/month, 2 fortnights/month).
 *
 * **Intentional approximation:** 4 weeks = 1 month (not 52/12 = 4.333...).
 * This introduces a ~1.3% annual variance (48 vs 52 weeks) but matches how
 * users naturally think about pay-to-month conversions. The precision loss is
 * acceptable for budgeting UX; exact annual figures should use the yearly
 * frequency directly.
 */
function convertToMonthly(amountCents: number, fromFrequency: IncomeFrequency): number {
  switch (fromFrequency) {
    case 'weekly':
      return Math.round(amountCents * 4); // $500/week → $2,000/month
    case 'fortnightly':
      return Math.round(amountCents * 2); // $2,778/fortnight → $5,556/month
    case 'monthly':
      return amountCents; // Already monthly
    case 'quarterly':
      return Math.round(amountCents / 3); // $12,000/quarter → $4,000/month
    case 'yearly':
      return Math.round(amountCents / 12); // $60,000/year → $5,000/month
    default: {
      const _exhaustive: never = fromFrequency;
      throw new Error(`Unknown income frequency: ${_exhaustive}`);
    }
  }
}

/**
 * Convert monthly amount TO target display period
 * Uses intuitive divisors (4 weeks/month, 2 fortnights/month)
 */
function convertFromMonthly(monthlyAmountCents: number, toPeriod: DisplayPeriod): number {
  switch (toPeriod) {
    case 'weekly':
      return Math.round(monthlyAmountCents / 4); // $2,000/month → $500/week
    case 'fortnightly':
      return Math.round(monthlyAmountCents / 2); // $5,556/month → $2,778/fortnight
    case 'monthly':
      return monthlyAmountCents; // Already monthly
    default: {
      const _exhaustive: never = toPeriod;
      throw new Error(`Unknown display period: ${_exhaustive}`);
    }
  }
}

/**
 * Main conversion function: FROM stored frequency TO display period
 *
 * Examples:
 * - Weekly $500 → Monthly: 500 × 4 = $2,000
 * - Fortnightly $2,778 → Monthly: 2,778 × 2 = $5,556
 * - Fortnightly $2,778 → Weekly: 2,778 / 2 = $1,389
 * - Yearly $60,000 → Fortnightly: (60,000 / 12) / 2 = $2,500
 */
export function convertIncomeFrequency(
  amountCents: number,
  fromFrequency: IncomeFrequency,
  toDisplayPeriod: DisplayPeriod
): number {
  // Step 1: Convert to monthly (universal baseline)
  const monthlyAmount = convertToMonthly(amountCents, fromFrequency);

  // Step 2: Convert from monthly to target period
  return convertFromMonthly(monthlyAmount, toDisplayPeriod);
}

