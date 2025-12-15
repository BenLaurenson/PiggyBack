/**
 * Shared utility to advance stale next_pay_date values on income_sources.
 *
 * When a pay date passes without a matching transaction (e.g. partner's bank
 * isn't connected to the webhook), the stored date goes stale. This module
 * detects stale dates at read-time and persists the correction so it only
 * runs once per cycle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentDate } from "@/lib/demo-guard";

/**
 * Advance a stored next_pay_date forward by frequency until it's today or later.
 * Pure function — no side effects.
 */
export function advancePayDate(
  storedDate: string | null,
  frequency: string | null
): string | null {
  if (!storedDate || !frequency) return storedDate;
  const today = getCurrentDate();
  today.setHours(0, 0, 0, 0);
  const date = new Date(storedDate + "T00:00:00");
  if (isNaN(date.getTime())) return storedDate;

  let iterations = 0;
  while (date < today && iterations < 200) {
    switch (frequency) {
      case "weekly":
        date.setDate(date.getDate() + 7);
        break;
      case "fortnightly":
        date.setDate(date.getDate() + 14);
        break;
      case "monthly":
        date.setMonth(date.getMonth() + 1);
        break;
      case "quarterly":
        date.setMonth(date.getMonth() + 3);
        break;
      case "yearly":
        date.setFullYear(date.getFullYear() + 1);
        break;
      case "bi-monthly":
        date.setMonth(date.getMonth() + 2);
        break;
      default:
        return storedDate;
    }
    iterations++;
  }
  return date.toISOString().split("T")[0];
}

interface IncomeSourceRow {
  id: string;
  next_pay_date: string | null;
  frequency: string | null;
  [key: string]: unknown;
}

/**
 * Check all provided income sources for stale next_pay_date values.
 * For any that are in the past, advance them and persist the update.
 *
 * Returns the sources with corrected next_pay_date values.
 * Runs fire-and-forget DB updates — callers don't need to await persistence.
 */
export function advanceStaleIncomeSources<T extends IncomeSourceRow>(
  supabase: SupabaseClient,
  sources: T[]
): T[] {
  if (!sources || sources.length === 0) return sources;

  const today = getCurrentDate();
  today.setHours(0, 0, 0, 0);

  return sources.map((source) => {
    if (!source.next_pay_date || !source.frequency) return source;

    const storedDate = new Date(source.next_pay_date + "T00:00:00");
    if (isNaN(storedDate.getTime()) || storedDate >= today) return source;

    // Date is stale — advance it
    const advanced = advancePayDate(source.next_pay_date, source.frequency);
    if (!advanced || advanced === source.next_pay_date) return source;

    // Persist the fix (fire-and-forget — don't block rendering)
    supabase
      .from("income_sources")
      .update({ next_pay_date: advanced })
      .eq("id", source.id)
      .then(({ error }) => {
        if (error) {
          console.error(
            `Failed to advance pay date for income source ${source.id}:`,
            error
          );
        }
      });

    return { ...source, next_pay_date: advanced };
  });
}
