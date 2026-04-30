/**
 * Single source of truth for goal-progress calculation.
 *
 * Formula:
 *   (current - start) / (target - start) * 100, capped at [0, 100].
 *
 * When start_amount_cents is 0 (legacy rows pre-2026-04-30 migration), the
 * formula degrades to current / target, matching pre-migration behaviour
 * exactly.
 *
 * The denominator is always positive (target > start by definition for a
 * forward-progress goal). If for any reason target <= start, returns 100
 * — the goal is already met.
 */
export interface GoalProgressInputs {
  current_amount_cents: number;
  target_amount_cents: number;
  start_amount_cents?: number | null;
}

export function goalProgressPercent(g: GoalProgressInputs): number {
  const start = g.start_amount_cents ?? 0;
  const denominator = g.target_amount_cents - start;
  if (denominator <= 0) return 100;
  const numerator = g.current_amount_cents - start;
  if (numerator <= 0) return 0;
  const pct = (numerator / denominator) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Convenience for "remaining" amount in cents.
 * Always non-negative.
 */
export function goalRemainingCents(g: GoalProgressInputs): number {
  const remaining = g.target_amount_cents - g.current_amount_cents;
  return Math.max(0, remaining);
}
