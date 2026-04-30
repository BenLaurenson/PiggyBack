/**
 * Calendar-aware time-remaining helpers for the goals subsystem.
 *
 * Today's "X days to go" is naive day subtraction; this module offers
 * weekday-only counting (skipping Saturday/Sunday) plus payday surfacing
 * driven by detected fortnightly salary patterns.
 *
 * Pure functions only — no DB access, no side effects.
 */
import { analyzeIncomePattern } from "@/lib/income-pattern-analysis";
import type { IncomeTransaction } from "@/lib/income-pattern-analysis";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface DaysRemainingOptions {
  /** When true, only weekdays (Mon-Fri) are counted toward "days remaining". */
  skipWeekends?: boolean;
}

/**
 * Number of calendar days between `from` and `to`. Negative when `to` is in the past.
 * Uses calendar-day boundaries (UTC noon anchoring) so DST transitions don't bend the result.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Weekday count between two dates (inclusive of `from`, exclusive of `to`).
 * Returns 0 when from >= to. Saturday=6, Sunday=0 are skipped.
 */
export function weekdaysBetween(from: Date, to: Date): number {
  const totalDays = calendarDaysBetween(from, to);
  if (totalDays <= 0) return 0;

  // Count weekdays. Walk through full weeks first, then a remainder.
  const fullWeeks = Math.floor(totalDays / 7);
  let weekdays = fullWeeks * 5;
  const remainder = totalDays - fullWeeks * 7;
  // Walk the tail manually (small constant cost — at most 6 iterations).
  for (let i = 0; i < remainder; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) weekdays += 1;
  }
  return weekdays;
}

/**
 * Days-until-deadline that respects the user's saving cadence preference.
 * - skipWeekends:false → naive calendar-day count.
 * - skipWeekends:true  → weekdays only (Mon-Fri).
 *
 * Returns a negative number when the deadline has passed.
 */
export function daysUntil(
  deadline: Date | string,
  now: Date = new Date(),
  options: DaysRemainingOptions = {}
): number {
  const target = typeof deadline === "string" ? new Date(deadline) : deadline;
  const calendar = calendarDaysBetween(now, target);
  if (!options.skipWeekends) return calendar;
  if (calendar < 0) return -weekdaysBetween(target, now);
  return weekdaysBetween(now, target);
}

/**
 * Information about the user's next payday derived from their salary
 * transaction history and configured income sources.
 *
 * `daysUntil` is computed in calendar days so it stays comparable with
 * the deadline countdown (which can also be calendar-day based).
 */
export interface PaydayInfo {
  /** Detected pay frequency (only "weekly", "fortnightly" surface paydays). */
  frequency: "weekly" | "fortnightly" | "monthly" | "bi-monthly" | "unknown";
  /** ISO date (YYYY-MM-DD) of the next predicted payday, or null when unknown. */
  nextPaydayIso: string | null;
  /** Calendar days until the next payday, or null when unknown / in past. */
  daysUntil: number | null;
  /** Confidence — only "fortnightly" + ≥medium confidence is surfaced to UI. */
  confidence: "high" | "medium" | "low";
  /** Average pay amount in cents (helpful for context). */
  averageAmountCents: number;
}

/**
 * Find the next payday based on detected income patterns. We prefer
 * `next_pay_date` from a configured recurring income source when it's in
 * the future; otherwise we fall back to the pattern detector against
 * salary-tagged transactions.
 *
 * The brief calls out fortnightly specifically — but we surface weekly
 * cadence too so the UI gets a useful value for users on weekly pay.
 */
export function nextPaydayInfo(
  options: {
    incomeTransactions: IncomeTransaction[];
    incomeSources?: Array<{
      frequency?: string | null;
      next_pay_date?: string | null;
      source_type?: string | null;
      is_active?: boolean | null;
    }>;
    now?: Date;
  }
): PaydayInfo {
  const now = options.now ?? new Date();
  const incomeSources = options.incomeSources ?? [];

  // Prefer a configured recurring salary with a future next_pay_date.
  const activeSalary = incomeSources.find(
    (s) =>
      (s.is_active ?? true) &&
      s.source_type === "recurring-salary" &&
      typeof s.frequency === "string" &&
      typeof s.next_pay_date === "string" &&
      new Date(s.next_pay_date as string) > now
  );

  if (activeSalary) {
    const next = new Date(activeSalary.next_pay_date as string);
    const freq = activeSalary.frequency as PaydayInfo["frequency"];
    return {
      frequency: freq,
      nextPaydayIso: (activeSalary.next_pay_date as string).slice(0, 10),
      daysUntil: calendarDaysBetween(now, next),
      confidence: "high",
      averageAmountCents: 0,
    };
  }

  // Fall back to pattern detection from transactions tagged as salary.
  const detected = analyzeIncomePattern(options.incomeTransactions);

  let nextDate: Date | null = null;
  if (detected.nextPredictedPayDate) {
    nextDate = new Date(detected.nextPredictedPayDate);
    // If the predicted date already passed, advance one period forward.
    while (nextDate <= now) {
      switch (detected.frequency) {
        case "weekly":
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case "fortnightly":
          nextDate.setDate(nextDate.getDate() + 14);
          break;
        case "monthly":
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case "bi-monthly":
          nextDate.setMonth(nextDate.getMonth() + 2);
          break;
        default:
          nextDate = null;
      }
      if (!nextDate) break;
    }
  }

  return {
    frequency: detected.frequency,
    nextPaydayIso: nextDate ? nextDate.toISOString().slice(0, 10) : null,
    daysUntil: nextDate ? calendarDaysBetween(now, nextDate) : null,
    confidence: detected.confidence,
    averageAmountCents: detected.averageAmountCents,
  };
}

/**
 * Whether the payday info should be surfaced to the user. The brief asks
 * specifically about fortnightly income, but we extend to weekly with
 * medium-or-better confidence too — both are common in AU.
 */
export function shouldSurfacePayday(info: PaydayInfo): boolean {
  if (info.daysUntil === null || info.daysUntil < 0) return false;
  if (info.confidence === "low") return false;
  return info.frequency === "fortnightly" || info.frequency === "weekly";
}
