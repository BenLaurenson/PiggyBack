// Goal calculation utilities for the goals dashboard
// Pure functions — no side effects, no database access

export interface GoalContribution {
  id: string;
  goal_id: string;
  amount_cents: number;
  balance_after_cents: number;
  source: "manual" | "webhook_sync" | "budget_allocation" | "initial";
  created_at: string;
}

export interface GoalDataPoint {
  date: string; // YYYY-MM-DD
  valueCents: number;
}

export interface GoalForCalculation {
  id: string;
  name: string;
  icon: string;
  color: string;
  current_amount_cents: number;
  target_amount_cents: number;
  deadline?: string | null;
  is_completed: boolean;
  created_at: string;
}

export type GoalStatusType =
  | "on-track"
  | "behind"
  | "ahead"
  | "overdue"
  | "no-deadline"
  | "completed";

export interface GoalStatus {
  status: GoalStatusType;
  projectedCompletionDate: Date | null;
  daysAheadOrBehind: number; // positive = ahead, negative = behind
  monthlySavingsNeeded: number; // cents per month to hit deadline
  currentMonthlySavingsRate: number; // actual cents per month from contributions
}

/**
 * Aggregate contributions across multiple goals into a combined savings timeline.
 * For each date with a contribution, sums the latest known balance for every goal.
 * Similar to aggregatePortfolioHistory in portfolio-aggregation.ts.
 */
export function aggregateGoalHistory(
  goals: GoalForCalculation[],
  contributions: GoalContribution[],
  startDate: Date,
  endDate: Date
): GoalDataPoint[] {
  if (goals.length === 0) return [];

  const startStr = toDateStr(startDate);
  const endStr = toDateStr(endDate);

  // Build per-goal timeline: goalId -> sorted [{date, balanceCents}]
  const perGoal = new Map<string, { date: string; balanceCents: number }[]>();
  for (const goal of goals) {
    perGoal.set(goal.id, []);
  }

  for (const c of contributions) {
    const dateStr = toDateStr(new Date(c.created_at));
    const arr = perGoal.get(c.goal_id);
    if (arr) {
      arr.push({ date: dateStr, balanceCents: c.balance_after_cents });
    }
  }

  // Sort each timeline by date
  for (const [, arr] of perGoal) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Collect all unique dates within range
  const allDates = new Set<string>();
  for (const [, arr] of perGoal) {
    for (const entry of arr) {
      if (entry.date >= startStr && entry.date <= endStr) {
        allDates.add(entry.date);
      }
    }
  }

  // Add start and end dates if there's history
  if (allDates.size > 0) {
    for (const goal of goals) {
      const goalCreated = toDateStr(new Date(goal.created_at));
      if (goalCreated <= startStr) {
        allDates.add(startStr);
      }
    }
    allDates.add(endStr);
  }

  const sortedDates = Array.from(allDates).sort();
  if (sortedDates.length === 0) return [];

  // Forward-fill: for each date, use the latest known balance per goal
  const result: GoalDataPoint[] = [];
  const lastKnown = new Map<string, number>();

  // Initialize with most recent values before startDate
  for (const c of contributions) {
    const dateStr = toDateStr(new Date(c.created_at));
    if (dateStr < startStr) {
      const existing = lastKnown.get(c.goal_id);
      if (existing === undefined || new Date(c.created_at).getTime() > 0) {
        // Always update to latest pre-start value
        const goalContribs = contributions
          .filter(
            (x) =>
              x.goal_id === c.goal_id &&
              toDateStr(new Date(x.created_at)) < startStr
          )
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
        if (goalContribs.length > 0) {
          lastKnown.set(c.goal_id, goalContribs[0].balance_after_cents);
        }
      }
    }
  }

  // Initialize goals with no pre-start history using current value as fallback
  for (const goal of goals) {
    if (!lastKnown.has(goal.id)) {
      const goalCreated = toDateStr(new Date(goal.created_at));
      if (goalCreated <= startStr) {
        lastKnown.set(goal.id, goal.current_amount_cents);
      }
    }
  }

  for (const date of sortedDates) {
    // Update lastKnown with values on this date
    for (const [goalId, arr] of perGoal) {
      const entriesForDate = arr.filter((e) => e.date === date);
      if (entriesForDate.length > 0) {
        lastKnown.set(
          goalId,
          entriesForDate[entriesForDate.length - 1].balanceCents
        );
      }
    }

    // Sum balance across all goals that existed by this date
    let total = 0;
    for (const goal of goals) {
      const goalCreated = toDateStr(new Date(goal.created_at));
      if (goalCreated <= date) {
        total += lastKnown.get(goal.id) || 0;
      }
    }

    result.push({ date, valueCents: total });
  }

  return result;
}

/**
 * Aggregate contributions for a single goal into a timeline.
 */
export function aggregateSingleGoalHistory(
  goal: GoalForCalculation,
  contributions: GoalContribution[],
  startDate: Date,
  endDate: Date
): GoalDataPoint[] {
  return aggregateGoalHistory([goal], contributions, startDate, endDate);
}

/**
 * Calculate the average savings rate from contributions over a given period.
 * Returns cents per day.
 */
export function calculateSavingsRate(
  contributions: GoalContribution[],
  periodDays: number = 90
): { dailyRate: number; monthlyRate: number; weeklyRate: number } {
  if (contributions.length === 0 || periodDays <= 0) {
    return { dailyRate: 0, monthlyRate: 0, weeklyRate: 0 };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);

  // Sum positive contributions within the period (exclude initial backfill)
  const recentContributions = contributions.filter(
    (c) => new Date(c.created_at) >= cutoff && c.source !== "initial"
  );

  const totalAdded = recentContributions.reduce(
    (sum, c) => sum + Math.max(0, c.amount_cents),
    0
  );

  const dailyRate = totalAdded / periodDays;
  return {
    dailyRate: Math.round(dailyRate),
    monthlyRate: Math.round(dailyRate * 30.44), // average days per month
    weeklyRate: Math.round(dailyRate * 7),
  };
}

/**
 * Calculate projected completion date for a goal based on recent savings rate.
 * Returns null if the goal has no deadline and no savings rate.
 */
export function calculateProjectedCompletion(
  goal: GoalForCalculation,
  contributions: GoalContribution[],
  budgetAllocationCents?: number
): Date | null {
  const remaining = goal.target_amount_cents - goal.current_amount_cents;
  if (remaining <= 0) return new Date(); // already complete

  // Use actual savings rate from last 90 days
  const { dailyRate } = calculateSavingsRate(contributions, 90);

  // If we have budget allocation, use the higher of actual rate vs budget rate
  const budgetDailyRate = budgetAllocationCents
    ? budgetAllocationCents / 30.44
    : 0;
  const effectiveRate = Math.max(dailyRate, budgetDailyRate);

  if (effectiveRate <= 0) return null; // no savings activity

  const daysNeeded = Math.ceil(remaining / effectiveRate);
  const projected = new Date();
  projected.setDate(projected.getDate() + daysNeeded);
  return projected;
}

/**
 * Classify a goal's status relative to its deadline and savings rate.
 */
export function classifyGoalStatus(
  goal: GoalForCalculation,
  contributions: GoalContribution[],
  budgetAllocationCents?: number
): GoalStatus {
  if (goal.is_completed) {
    return {
      status: "completed",
      projectedCompletionDate: null,
      daysAheadOrBehind: 0,
      monthlySavingsNeeded: 0,
      currentMonthlySavingsRate: calculateSavingsRate(contributions, 90)
        .monthlyRate,
    };
  }

  const { monthlyRate } = calculateSavingsRate(contributions, 90);
  const projectedDate = calculateProjectedCompletion(
    goal,
    contributions,
    budgetAllocationCents
  );

  const remaining = goal.target_amount_cents - goal.current_amount_cents;

  if (!goal.deadline) {
    return {
      status: "no-deadline",
      projectedCompletionDate: projectedDate,
      daysAheadOrBehind: 0,
      monthlySavingsNeeded: 0,
      currentMonthlySavingsRate: monthlyRate,
    };
  }

  const deadlineDate = new Date(goal.deadline);
  const now = new Date();
  const daysUntilDeadline = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Monthly savings needed to hit deadline
  const monthsUntilDeadline = Math.max(daysUntilDeadline / 30.44, 0.1);
  const monthlySavingsNeeded =
    remaining > 0 ? Math.ceil(remaining / monthsUntilDeadline) : 0;

  // If deadline has passed and goal not complete, it's overdue
  if (daysUntilDeadline < 0 && remaining > 0) {
    return {
      status: "overdue",
      projectedCompletionDate: projectedDate,
      daysAheadOrBehind: daysUntilDeadline,
      monthlySavingsNeeded,
      currentMonthlySavingsRate: monthlyRate,
    };
  }

  // Compare projected date to deadline
  if (!projectedDate) {
    // No savings activity - if deadline is in the future, we're behind
    return {
      status: "behind",
      projectedCompletionDate: null,
      daysAheadOrBehind: 0,
      monthlySavingsNeeded,
      currentMonthlySavingsRate: monthlyRate,
    };
  }

  const projectedDays = Math.ceil(
    (projectedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysAheadOrBehind = daysUntilDeadline - projectedDays; // positive = ahead

  // 7-day buffer for "on-track"
  if (Math.abs(daysAheadOrBehind) <= 7) {
    return {
      status: "on-track",
      projectedCompletionDate: projectedDate,
      daysAheadOrBehind,
      monthlySavingsNeeded,
      currentMonthlySavingsRate: monthlyRate,
    };
  }

  return {
    status: daysAheadOrBehind > 0 ? "ahead" : "behind",
    projectedCompletionDate: projectedDate,
    daysAheadOrBehind,
    monthlySavingsNeeded,
    currentMonthlySavingsRate: monthlyRate,
  };
}

export interface SuggestedSavings {
  weekly: number; // cents per week
  fortnightly: number; // cents per fortnight
  monthly: number; // cents per month
  hasDeadline: boolean;
  daysRemaining: number | null;
}

/**
 * Calculate suggested savings amounts at W/F/M frequencies to reach goal by deadline.
 * If no deadline, returns 0 for all (no suggestion possible).
 */
export function calculateSuggestedSavings(
  remainingCents: number,
  deadline?: string | null,
  now: Date = new Date()
): SuggestedSavings {
  if (!deadline || remainingCents <= 0) {
    return { weekly: 0, fortnightly: 0, monthly: 0, hasDeadline: !!deadline, daysRemaining: null };
  }

  const deadlineDate = new Date(deadline);
  const msRemaining = deadlineDate.getTime() - now.getTime();
  const daysRemaining = Math.max(msRemaining / (1000 * 60 * 60 * 24), 0);

  if (daysRemaining <= 0) {
    // Overdue — show what's needed if they still want to reach it within 1 month
    return {
      weekly: Math.ceil(remainingCents / 4),
      fortnightly: Math.ceil(remainingCents / 2),
      monthly: remainingCents,
      hasDeadline: true,
      daysRemaining: 0,
    };
  }

  const weeksRemaining = Math.max(daysRemaining / 7, 1);
  const fortnightsRemaining = Math.max(daysRemaining / 14, 1);
  const monthsRemaining = Math.max(daysRemaining / 30.44, 1);

  return {
    weekly: Math.ceil(remainingCents / weeksRemaining),
    fortnightly: Math.ceil(remainingCents / fortnightsRemaining),
    monthly: Math.ceil(remainingCents / monthsRemaining),
    hasDeadline: true,
    daysRemaining: Math.ceil(daysRemaining),
  };
}

/**
 * Get the start date for a given time period.
 * Re-exported from portfolio-aggregation for consistency.
 */
export function getStartDateForPeriod(
  period: string,
  now: Date = new Date()
): Date {
  const d = new Date(now);
  switch (period) {
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "6M":
      d.setMonth(d.getMonth() - 6);
      return d;
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case "ALL":
      return new Date(2000, 0, 1);
    default:
      d.setMonth(d.getMonth() - 3);
      return d;
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
