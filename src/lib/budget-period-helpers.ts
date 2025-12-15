/**
 * Budget Period Helper Functions
 * Utilities for calculating period boundaries and prorating budget amounts
 *
 * TIME SYSTEM: Timezone-aware with month-aligned periods
 * - Period boundaries align to midnight in the user's timezone (default: Australia/Sydney)
 * - Weekly periods are month-aligned (1-7, 8-14, 15-21, 22-end), NOT ISO weeks
 * - Fortnightly periods are month-aligned (1-14, 15-end)
 * - This is intentionally different from expense-period-utils.ts, which uses
 *   local time with Monday-based ISO weeks
 *
 * WHY: Budget periods need boundaries that match the user's wall-clock midnight,
 * not UTC midnight. An Australian user (UTC+10/11) would otherwise see budget
 * periods start/end at 10-11am local time. Month-aligned weeks ensure 4 weeks
 * per month for cleaner budget proration (monthly / 4 = weekly amount).
 */

import {
  DEFAULT_BUDGET_TIMEZONE,
  getDateComponentsInTimezone,
} from "./budget-engine";

/**
 * Metadata describing the time system used by this module.
 * See expense-period-utils.ts for the alternative time system.
 */
export const TIME_SYSTEM = {
  timezone: 'user' as const,
  weekSystem: 'month-aligned' as const,
  description: 'Budget periods use user timezone (default: Australia/Sydney) with month-aligned weeks (1-7, 8-14, 15-21, 22-end)',
};

export interface PeriodBoundaries {
  start: Date;
  end: Date;
  label: string;
}

/**
 * Get the timezone-local date components (year, month, day) for a reference date.
 * This replaces the old pattern of using getUTCFullYear/getUTCMonth/getUTCDate.
 */
function getLocalComponents(
  referenceDate: Date,
  timezone: string = DEFAULT_BUDGET_TIMEZONE
): { year: number; month: number; day: number } {
  return getDateComponentsInTimezone(referenceDate, timezone);
}

/**
 * Get period start date based on period type
 *
 * Month-aligned periods:
 * - Weekly: 4 weeks per month (1-7, 8-14, 15-21, 22-end)
 * - Fortnightly: 2 fortnights per month (1-14, 15-end)
 * - Monthly: Full month
 *
 * Returns a Date with the start day set in UTC for consistent display.
 * These dates are for UI display purposes (period labels, picker).
 * For database queries, use getBudgetPeriodRange from budget-engine.ts.
 */
export function getPeriodStartDate(
  referenceDate: Date,
  periodType: 'weekly' | 'fortnightly' | 'monthly'
): Date {
  const { year, month, day } = getLocalComponents(referenceDate);

  if (periodType === 'weekly') {
    // Month-aligned weeks: 1-7, 8-14, 15-21, 22-end
    let startDay: number;
    if (day <= 7) {
      startDay = 1;
    } else if (day <= 14) {
      startDay = 8;
    } else if (day <= 21) {
      startDay = 15;
    } else {
      startDay = 22;
    }
    return new Date(Date.UTC(year, month, startDay, 0, 0, 0, 0));
  }

  if (periodType === 'fortnightly') {
    // Month-aligned fortnights: 1-14, 15-end
    const startDay = day <= 14 ? 1 : 15;
    return new Date(Date.UTC(year, month, startDay, 0, 0, 0, 0));
  }

  // Monthly: first day of month
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

/**
 * Get period end date based on period type
 *
 * Month-aligned periods:
 * - Weekly: Week 1 (1-7), Week 2 (8-14), Week 3 (15-21), Week 4 (22-end of month)
 * - Fortnightly: 1st half (1-14), 2nd half (15-end of month)
 * - Monthly: Full month
 *
 * Returns a Date with the end day set in UTC for consistent display.
 */
export function getPeriodEndDate(
  referenceDate: Date,
  periodType: 'weekly' | 'fortnightly' | 'monthly'
): Date {
  const start = getPeriodStartDate(referenceDate, periodType);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const startDay = start.getUTCDate();

  if (periodType === 'weekly') {
    // Month-aligned weeks: 1-7, 8-14, 15-21, 22-end
    let endDay: number;
    if (startDay === 1) {
      endDay = 7;
    } else if (startDay === 8) {
      endDay = 14;
    } else if (startDay === 15) {
      endDay = 21;
    } else {
      // Week 4 ends at end of month
      return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    }
    return new Date(Date.UTC(year, month, endDay, 23, 59, 59, 999));
  }

  if (periodType === 'fortnightly') {
    // Month-aligned fortnights: 1-14, 15-end
    if (startDay === 1) {
      return new Date(Date.UTC(year, month, 14, 23, 59, 59, 999));
    } else {
      // Second fortnight ends at end of month
      return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    }
  }

  // Monthly: last day of month
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

/**
 * Get current period boundaries based on type
 */
export function getCurrentPeriodBoundaries(
  referenceDate: Date,
  periodType: 'weekly' | 'fortnightly' | 'monthly'
): PeriodBoundaries {
  const start = getPeriodStartDate(referenceDate, periodType);
  const end = getPeriodEndDate(referenceDate, periodType);

  let label: string;
  if (periodType === 'weekly') {
    label = `Week of ${start.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  } else if (periodType === 'fortnightly') {
    label = `${start.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${end.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  } else {
    label = start.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  return { start, end, label };
}

/**
 * Prorate budget amount for period
 */
export function prorateBudgetForPeriod(
  monthlyAmount: number,
  periodType: 'weekly' | 'fortnightly' | 'monthly'
): number {
  if (periodType === 'weekly') {
    // Monthly amount / 4 (intuitive weeks per month)
    return Math.round(monthlyAmount / 4);
  }

  if (periodType === 'fortnightly') {
    // Monthly amount / 2 (intuitive fortnights per month)
    return Math.round(monthlyAmount / 2);
  }

  return monthlyAmount;
}
