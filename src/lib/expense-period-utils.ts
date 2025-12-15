/**
 * Utility functions for calculating expense billing periods
 * Used to determine which period a payment covers based on transaction date
 *
 * TIME SYSTEM: Local time with Monday-based ISO weeks
 * - All dates are constructed and compared using local time (getDate, getMonth, etc.)
 * - Weekly periods start on Monday (ISO week convention), NOT month-aligned
 * - This is intentionally different from budget-period-helpers.ts, which uses
 *   UTC with month-aligned periods (1-7, 8-14, 15-21, 22-end)
 *
 * WHY: Expense billing periods are based on when transactions actually occur
 * in the user's local timezone. Users think of "this week" as Monday-Sunday,
 * so we use Monday-based weeks. formatPeriodDate() uses local date components
 * to avoid UTC offset issues for users in positive UTC offset timezones (e.g., AEST).
 */

/**
 * Metadata describing the time system used by this module.
 * See budget-period-helpers.ts for the alternative time system.
 */
export const TIME_SYSTEM = {
  timezone: 'local' as const,
  weekSystem: 'monday-based' as const,
  description: 'Expense periods use local time with Monday-based ISO weeks',
};

/**
 * Calculate the start of the billing period for a given date
 * based on the expense recurrence type.
 *
 * Uses LOCAL time (not UTC) because transaction dates are displayed
 * and understood by users in their local timezone.
 *
 * @param date - The transaction/payment date
 * @param recurrenceType - The expense recurrence type
 * @returns The first day of the billing period (in local time)
 */
export function calculatePeriodStart(
  date: Date | string,
  recurrenceType: string
): Date {
  const d = new Date(date);

  switch (recurrenceType) {
    case "weekly": {
      // Start of week (Monday)
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    }

    case "fortnightly": {
      // For fortnightly, use Monday of the week (same as weekly)
      // The expense's next_due_date helps determine the correct fortnight
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    }

    case "monthly": {
      // First day of month
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    case "quarterly": {
      // First day of quarter
      const quarter = Math.floor(d.getMonth() / 3);
      return new Date(d.getFullYear(), quarter * 3, 1);
    }

    case "yearly": {
      // First day of year
      return new Date(d.getFullYear(), 0, 1);
    }

    case "one-time": {
      // For one-time, use the date itself (first day of month containing it)
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }

    default:
      // Default to monthly
      return new Date(d.getFullYear(), d.getMonth(), 1);
  }
}

/**
 * Format a period date as an ISO date string (YYYY-MM-DD)
 * This is the format stored in the database
 *
 * IMPORTANT: Uses local date components (not UTC) because calculatePeriodStart
 * creates dates in local time. Using toISOString() would convert to UTC and
 * potentially return the wrong date for users in positive UTC offset timezones.
 */
export function formatPeriodDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate period start and return as ISO date string
 * Convenience function combining calculatePeriodStart and formatPeriodDate
 */
export function getPeriodForTransaction(
  transactionDate: Date | string,
  recurrenceType: string
): string {
  const periodStart = calculatePeriodStart(transactionDate, recurrenceType);
  return formatPeriodDate(periodStart);
}

/**
 * Check if a transaction date falls within a given budget period
 *
 * @param transactionDate - The transaction date to check
 * @param periodStart - Start of the budget period
 * @param periodEnd - End of the budget period
 * @returns True if the transaction is within the period
 */
export function isTransactionInPeriod(
  transactionDate: Date | string,
  periodStart: Date,
  periodEnd: Date
): boolean {
  const txnDate = new Date(transactionDate);
  return txnDate >= periodStart && txnDate <= periodEnd;
}

/**
 * Get human-readable label for a period
 */
export function getPeriodLabel(periodDate: Date, recurrenceType: string): string {
  switch (recurrenceType) {
    case "weekly":
      return `Week of ${periodDate.toLocaleDateString("en-AU", { month: "short", day: "numeric" })}`;

    case "fortnightly":
      return `Fortnight of ${periodDate.toLocaleDateString("en-AU", { month: "short", day: "numeric" })}`;

    case "monthly":
      return periodDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

    case "quarterly": {
      const quarter = Math.floor(periodDate.getMonth() / 3) + 1;
      return `Q${quarter} ${periodDate.getFullYear()}`;
    }

    case "yearly":
      return periodDate.getFullYear().toString();

    default:
      return periodDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }
}
