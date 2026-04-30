/**
 * Pure helpers shared by /invest server pages, server actions, and the
 * webhook detection logic. No "use server" — safe to import from client.
 */

export type Frequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "yearly";

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

/**
 * Walk forward from {anchor} by {frequency} until we reach the first date
 * >= {now}. Returns ISO date string (YYYY-MM-DD).
 *
 * If anchor is already in the future, returns anchor unchanged. Capped at
 * 10_000 iterations as a safety net for bad input.
 */
export function computeNextDueDate(
  anchor: string,
  frequency: Frequency | string,
  now: Date = new Date()
): string {
  const a = new Date(anchor + "T00:00:00Z");
  const cursor = new Date(a);
  if (cursor.getTime() >= now.getTime()) {
    return cursor.toISOString().slice(0, 10);
  }
  const step = (d: Date) => {
    switch (frequency) {
      case "weekly":
        d.setUTCDate(d.getUTCDate() + 7);
        break;
      case "fortnightly":
        d.setUTCDate(d.getUTCDate() + 14);
        break;
      case "monthly":
        d.setUTCMonth(d.getUTCMonth() + 1);
        break;
      case "quarterly":
        d.setUTCMonth(d.getUTCMonth() + 3);
        break;
      case "yearly":
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        break;
      default:
        d.setUTCMonth(d.getUTCMonth() + 1);
    }
  };
  let iterations = 0;
  while (cursor.getTime() < now.getTime() && iterations < 10_000) {
    step(cursor);
    iterations++;
  }
  return cursor.toISOString().slice(0, 10);
}

/**
 * Case-insensitive substring match used by the Up Bank webhook to attribute
 * incoming transactions to a recurring rule. Centralised here so the
 * client can preview matches with the same logic.
 */
export function transactionMatchesPattern(
  description: string | null | undefined,
  pattern: string
): boolean {
  if (!description) return false;
  if (!pattern) return false;
  return description.toLowerCase().includes(pattern.trim().toLowerCase());
}

/**
 * Split a contribution row's value vs the asset's CURRENT market value
 * into "money in" (sum of contributions) vs "growth" (current value minus
 * contributions). Used by the per-rule chart in invest-client.tsx.
 *
 * Caller passes the relevant rule's contribution rows AND the asset's
 * current_value_cents from the corresponding investments row.
 */
export function contributionVsGrowth(
  contributionsCents: number[],
  currentAssetValueCents: number
): { contributedCents: number; growthCents: number } {
  const contributedCents = contributionsCents.reduce((s, c) => s + c, 0);
  // Cap growth at 0 if current value < contributions to avoid showing
  // "negative growth" when the user just hasn't refreshed their price.
  const growthCents = Math.max(0, currentAssetValueCents - contributedCents);
  return { contributedCents, growthCents };
}
