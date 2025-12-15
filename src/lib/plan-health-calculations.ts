// ============================================================================
// Plan Health Calculations
// Pure functions for the Financial Health Snapshot and Priority Recommendations.
// No database access — all data passed in as arguments.
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export type MetricStatus = "good" | "warning" | "concern";
export type TrendDirection = "up" | "down" | "flat";

export interface HealthMetric {
  id: string;
  label: string;
  value: string;
  rawValue: number;
  status: MetricStatus;
  trend: TrendDirection;
  statusLabel: string;
  icon: string;
}

export interface PriorityRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  actionHref?: string;
  icon: string;
  category: string;
}

export interface GoalInteraction {
  goalId: string;
  goalName: string;
  warningMessage: string;
  emergencyFundMonthsAfter: number;
}

export interface NetWorthSnapshot {
  snapshot_date: string;
  total_balance_cents: number;
  investment_total_cents?: number | null;
}

export interface GoalSummary {
  current_amount_cents: number;
  target_amount_cents: number;
  is_completed: boolean;
}

export interface GoalForTimeline {
  id: string;
  name: string;
  deadline: string;
  target_amount_cents: number;
  is_completed: boolean;
}

export interface HealthMetricInputs {
  netWorthSnapshots: NetWorthSnapshot[];
  monthlyIncomeCents: number;
  monthlySpendingCents: number;
  previousSavingsRates: number[];
  liquidBalanceCents: number;
  monthlyEssentialsCents: number;
  goals: GoalSummary[];
  essentialCents: number;
  discretionaryCents: number;
  totalExpenseDefinitions: number;
  matchedExpenseCount: number;
  homeLoanBalanceCents: number;
  annualIncomeCents: number;
}

export interface RecommendationInputs {
  healthMetrics: HealthMetric[];
  emergencyFundMonths: number;
  savingsRatePercent: number;
  essentialRatioPercent: number;
  superCapRoomCents: number;
  rebalancingNeeded: boolean;
  goalsBehindCount: number;
  unpaidBillsCount: number;
  upcomingGoals: GoalForTimeline[];
  liquidBalanceCents: number;
}

// ============================================================================
// Constants
// ============================================================================

const SUPER_CONCESSIONAL_CAP_CENTS = 30_000_00; // $30,000

// ============================================================================
// Formatting Helpers
// ============================================================================

const formatCurrency = (cents: number): string =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const formatPercent = (value: number): string => `${Math.round(value)}%`;

// ============================================================================
// Individual Metric Calculations
// ============================================================================

export function calculateNetWorthTrend(
  snapshots: NetWorthSnapshot[]
): HealthMetric {
  if (snapshots.length === 0) {
    return {
      id: "net-worth",
      label: "Net Worth",
      value: "$0",
      rawValue: 0,
      status: "concern",
      trend: "flat",
      statusLabel: "No net worth data available yet",
      icon: "TrendingUp",
    };
  }

  const sorted = [...snapshots].sort(
    (a, b) =>
      new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const latestValue = latest.total_balance_cents + (latest.investment_total_cents || 0);

  // Compare to earliest snapshot in the window
  const earliest = sorted[0];
  const earliestValue = earliest.total_balance_cents + (earliest.investment_total_cents || 0);
  const delta = latestValue - earliestValue;

  // Determine trend from recent movement
  let trend: TrendDirection = "flat";
  // Use 1% threshold to avoid noise
  const threshold = Math.abs(earliestValue) * 0.01;
  if (delta > threshold) trend = "up";
  else if (delta < -threshold) trend = "down";

  let status: MetricStatus;
  let statusLabel: string;

  if (trend === "up") {
    status = "good";
    statusLabel = `Your net worth is growing — up ${formatCurrency(Math.abs(delta))} recently`;
  } else if (trend === "flat") {
    status = "warning";
    statusLabel = "Your net worth has been stable recently";
  } else {
    status = "concern";
    statusLabel = `Your net worth has decreased ${formatCurrency(Math.abs(delta))} recently`;
  }

  return {
    id: "net-worth",
    label: "Net Worth",
    value: formatCurrency(latestValue),
    rawValue: latestValue,
    status,
    trend,
    statusLabel,
    icon: "TrendingUp",
  };
}

export function calculateSavingsRateMetric(
  monthlyIncomeCents: number,
  monthlySpendingCents: number,
  previousRates: number[]
): HealthMetric {
  const currentRate =
    monthlyIncomeCents > 0
      ? ((monthlyIncomeCents - monthlySpendingCents) / monthlyIncomeCents) * 100
      : 0;

  const clampedRate = Math.max(0, currentRate);

  // Trend: compare to average of previous rates
  let trend: TrendDirection = "flat";
  if (previousRates.length > 0) {
    const avgPrevious =
      previousRates.reduce((sum, r) => sum + r, 0) / previousRates.length;
    if (clampedRate > avgPrevious + 2) trend = "up";
    else if (clampedRate < avgPrevious - 2) trend = "down";
  }

  let status: MetricStatus;
  let statusLabel: string;

  if (clampedRate >= 20) {
    status = "good";
    statusLabel = `Your savings rate is healthy at ${formatPercent(clampedRate)}`;
  } else if (clampedRate >= 10) {
    status = "warning";
    statusLabel = `Your savings rate of ${formatPercent(clampedRate)} could be improved`;
  } else {
    status = "concern";
    statusLabel =
      clampedRate > 0
        ? `Your savings rate of ${formatPercent(clampedRate)} is below the recommended 10%`
        : "You're spending more than you earn";
  }

  return {
    id: "savings-rate",
    label: "Savings Rate",
    value: formatPercent(clampedRate),
    rawValue: clampedRate,
    status,
    trend,
    statusLabel,
    icon: "PiggyBank",
  };
}

export function calculateEmergencyFundMetric(
  liquidBalanceCents: number,
  monthlyEssentialsCents: number
): HealthMetric {
  if (monthlyEssentialsCents <= 0) {
    return {
      id: "emergency-fund",
      label: "Emergency Fund",
      value: formatCurrency(liquidBalanceCents),
      rawValue: 0,
      status: "warning",
      trend: "flat",
      statusLabel: "Not enough spending data to assess emergency fund",
      icon: "ShieldCheck",
    };
  }

  const months = liquidBalanceCents / monthlyEssentialsCents;
  const monthsRounded = Math.round(months * 10) / 10;

  let status: MetricStatus;
  let statusLabel: string;

  if (months >= 6) {
    status = "good";
    statusLabel = `You have ${monthsRounded} months of essential expenses covered`;
  } else if (months >= 3) {
    status = "warning";
    statusLabel = `${monthsRounded} months covered — aim for 6 months of essentials`;
  } else {
    status = "concern";
    statusLabel =
      months > 0
        ? `Only ${monthsRounded} months of essentials covered — build to 3+ months`
        : "No emergency fund — prioritise building one";
  }

  return {
    id: "emergency-fund",
    label: "Emergency Fund",
    value: `${monthsRounded} mo`,
    rawValue: months,
    status,
    trend: "flat", // Emergency fund trend needs historical data we don't track yet
    statusLabel,
    icon: "ShieldCheck",
  };
}

export function calculateGoalsProgressMetric(
  goals: GoalSummary[]
): HealthMetric {
  const activeGoals = goals.filter((g) => !g.is_completed);

  if (activeGoals.length === 0) {
    return {
      id: "goals-progress",
      label: "Goals Progress",
      value: "No goals",
      rawValue: 0,
      status: "warning",
      trend: "flat",
      statusLabel: "Set some savings goals to track your progress",
      icon: "Target",
    };
  }

  const totalCurrent = activeGoals.reduce(
    (sum, g) => sum + g.current_amount_cents,
    0
  );
  const totalTarget = activeGoals.reduce(
    (sum, g) => sum + g.target_amount_cents,
    0
  );
  const overallPercent =
    totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  let status: MetricStatus;
  let statusLabel: string;

  if (overallPercent >= 70) {
    status = "good";
    statusLabel = `${formatPercent(overallPercent)} of your savings goals reached`;
  } else if (overallPercent >= 40) {
    status = "warning";
    statusLabel = `${formatPercent(overallPercent)} of goals reached — keep saving`;
  } else {
    status = "concern";
    statusLabel = `${formatPercent(overallPercent)} of goals reached — consider increasing contributions`;
  }

  return {
    id: "goals-progress",
    label: "Goals Progress",
    value: formatPercent(overallPercent),
    rawValue: overallPercent,
    status,
    trend: "flat",
    statusLabel,
    icon: "Target",
  };
}

export function calculateSpendingRatioMetric(
  essentialCents: number,
  discretionaryCents: number
): HealthMetric {
  const total = essentialCents + discretionaryCents;
  if (total === 0) {
    return {
      id: "spending-ratio",
      label: "Essential Ratio",
      value: "N/A",
      rawValue: 0,
      status: "warning",
      trend: "flat",
      statusLabel: "No spending data available yet",
      icon: "Scale",
    };
  }

  const essentialPercent = (essentialCents / total) * 100;

  let status: MetricStatus;
  let statusLabel: string;

  if (essentialPercent < 50) {
    status = "good";
    statusLabel = `${formatPercent(essentialPercent)} of spending is on essentials — good balance`;
  } else if (essentialPercent <= 65) {
    status = "warning";
    statusLabel = `${formatPercent(essentialPercent)} on essentials — some room to optimise`;
  } else {
    status = "concern";
    statusLabel = `${formatPercent(essentialPercent)} on essentials — high ratio, review subscriptions`;
  }

  return {
    id: "spending-ratio",
    label: "Essential Ratio",
    value: formatPercent(essentialPercent),
    rawValue: essentialPercent,
    status,
    trend: "flat",
    statusLabel,
    icon: "Scale",
  };
}

export function calculateBillsPaymentMetric(
  totalExpenseDefinitions: number,
  matchedExpenseCount: number
): HealthMetric {
  if (totalExpenseDefinitions === 0) {
    return {
      id: "bills-payment",
      label: "Bills Paid",
      value: "N/A",
      rawValue: 0,
      status: "good",
      trend: "flat",
      statusLabel: "No tracked bills this period",
      icon: "Receipt",
    };
  }

  const rate = (matchedExpenseCount / totalExpenseDefinitions) * 100;

  let status: MetricStatus;
  let statusLabel: string;

  if (rate >= 90) {
    status = "good";
    statusLabel =
      rate >= 100
        ? "All bills paid this period"
        : `${formatPercent(rate)} of bills paid — almost there`;
  } else if (rate >= 70) {
    status = "warning";
    statusLabel = `${formatPercent(rate)} of bills paid — ${totalExpenseDefinitions - matchedExpenseCount} still due`;
  } else {
    status = "concern";
    statusLabel = `Only ${formatPercent(rate)} of bills paid — ${totalExpenseDefinitions - matchedExpenseCount} outstanding`;
  }

  return {
    id: "bills-payment",
    label: "Bills Paid",
    value: `${matchedExpenseCount}/${totalExpenseDefinitions}`,
    rawValue: rate,
    status,
    trend: "flat",
    statusLabel,
    icon: "Receipt",
  };
}

export function calculateDebtToIncomeMetric(
  homeLoanBalanceCents: number,
  annualIncomeCents: number
): HealthMetric | null {
  // Only show if user has debt
  if (homeLoanBalanceCents <= 0) return null;

  if (annualIncomeCents <= 0) {
    return {
      id: "debt-to-income",
      label: "Debt-to-Income",
      value: "N/A",
      rawValue: 0,
      status: "warning",
      trend: "flat",
      statusLabel: "No income data to calculate debt-to-income ratio",
      icon: "Building2",
    };
  }

  const ratio = homeLoanBalanceCents / annualIncomeCents;
  const ratioRounded = Math.round(ratio * 10) / 10;

  let status: MetricStatus;
  let statusLabel: string;

  if (ratio < 3) {
    status = "good";
    statusLabel = `Debt-to-income ratio of ${ratioRounded}x is manageable`;
  } else if (ratio <= 5) {
    status = "warning";
    statusLabel = `Debt-to-income ratio of ${ratioRounded}x is moderate`;
  } else {
    status = "concern";
    statusLabel = `Debt-to-income ratio of ${ratioRounded}x is high — focus on repayment`;
  }

  return {
    id: "debt-to-income",
    label: "Debt-to-Income",
    value: `${ratioRounded}x`,
    rawValue: ratio,
    status,
    trend: "flat",
    statusLabel,
    icon: "Building2",
  };
}

// ============================================================================
// Orchestrator
// ============================================================================

export function generateHealthMetrics(data: HealthMetricInputs): HealthMetric[] {
  const metrics: HealthMetric[] = [];

  metrics.push(calculateNetWorthTrend(data.netWorthSnapshots));

  metrics.push(
    calculateSavingsRateMetric(
      data.monthlyIncomeCents,
      data.monthlySpendingCents,
      data.previousSavingsRates
    )
  );

  metrics.push(
    calculateEmergencyFundMetric(
      data.liquidBalanceCents,
      data.monthlyEssentialsCents
    )
  );

  metrics.push(calculateGoalsProgressMetric(data.goals));

  metrics.push(
    calculateSpendingRatioMetric(data.essentialCents, data.discretionaryCents)
  );

  metrics.push(
    calculateBillsPaymentMetric(
      data.totalExpenseDefinitions,
      data.matchedExpenseCount
    )
  );

  const debtMetric = calculateDebtToIncomeMetric(
    data.homeLoanBalanceCents,
    data.annualIncomeCents
  );
  if (debtMetric) {
    metrics.push(debtMetric);
  }

  return metrics;
}

// ============================================================================
// Super Cap Room Calculation
// ============================================================================

export function calculateSuperCapRoom(
  annualSalaryCents: number,
  sgRatePercent: number,
  voluntaryContributionsCents: number = 0
): { capCents: number; usedCents: number; remainingCents: number } {
  const employerSgCents = Math.round(
    annualSalaryCents * (sgRatePercent / 100)
  );
  const usedCents = employerSgCents + voluntaryContributionsCents;
  const remainingCents = Math.max(0, SUPER_CONCESSIONAL_CAP_CENTS - usedCents);

  return {
    capCents: SUPER_CONCESSIONAL_CAP_CENTS,
    usedCents,
    remainingCents,
  };
}

// ============================================================================
// Priority Recommendations
// ============================================================================

export function generatePriorityRecommendations(
  data: RecommendationInputs
): PriorityRecommendation[] {
  const recs: PriorityRecommendation[] = [];

  // 1. Emergency fund < 3 months
  if (data.emergencyFundMonths < 3) {
    const monthsNeeded = Math.ceil(3 - data.emergencyFundMonths);
    recs.push({
      id: "emergency-fund-low",
      priority: "high",
      title: "Build your emergency fund",
      description:
        data.emergencyFundMonths > 0
          ? `You have ${data.emergencyFundMonths.toFixed(1)} months of essential expenses saved. Aim for at least 3 months.`
          : "You don't have an emergency fund yet. Start with a goal to cover 3 months of essentials.",
      impact: `Need approximately ${monthsNeeded} more months of savings`,
      actionHref: "/goals",
      icon: "ShieldAlert",
      category: "Emergency Fund",
    });
  }

  // 2. Savings rate < 10%
  if (data.savingsRatePercent < 10) {
    recs.push({
      id: "low-savings-rate",
      priority: "high",
      title: "Increase your savings rate",
      description: `Your savings rate is ${Math.round(data.savingsRatePercent)}%. Aim for at least 20% for long-term financial health.`,
      impact: "Review discretionary spending for potential savings",
      actionHref: "/budget",
      icon: "TrendingDown",
      category: "Budget",
    });
  }

  // 3. Bills unpaid this period
  if (data.unpaidBillsCount > 0) {
    recs.push({
      id: "unpaid-bills",
      priority: "high",
      title: `${data.unpaidBillsCount} bill${data.unpaidBillsCount === 1 ? "" : "s"} still due`,
      description: `You have ${data.unpaidBillsCount} unpaid bill${data.unpaidBillsCount === 1 ? "" : "s"} this period. Check your expenses to avoid late fees.`,
      impact: "Avoid late fees and maintain good payment history",
      actionHref: "/budget?tab=expenses",
      icon: "AlertTriangle",
      category: "Bills",
    });
  }

  // 4. Upcoming goal within 6 months with insufficient savings
  const now = new Date();
  const sixMonthsFromNow = new Date(now);
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

  for (const goal of data.upcomingGoals) {
    if (goal.is_completed) continue;
    const targetDate = new Date(goal.deadline);
    if (
      targetDate <= sixMonthsFromNow &&
      goal.target_amount_cents > 0 &&
      data.liquidBalanceCents < goal.target_amount_cents
    ) {
      const shortfall =
        goal.target_amount_cents - data.liquidBalanceCents;
      recs.push({
        id: `goal-deadline-${goal.id}`,
        priority: "high",
        title: `Save for "${goal.name}"`,
        description: `Your goal "${goal.name}" is coming up and you're ${formatCurrency(shortfall)} short of the ${formatCurrency(goal.target_amount_cents)} target.`,
        impact: `Due ${targetDate.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`,
        actionHref: `/goals/${goal.id}`,
        icon: "Flag",
        category: "Goals",
      });
      break; // Only show one goal warning
    }
  }

  // 5. Super cap room > $10K
  if (data.superCapRoomCents > 10_000_00) {
    recs.push({
      id: "super-cap-room",
      priority: "medium",
      title: "Unused super contribution room",
      description: `You have ${formatCurrency(data.superCapRoomCents)} of unused concessional super cap this financial year. Salary sacrifice could reduce your tax.`,
      impact: "Tax-effective way to boost retirement savings",
      actionHref: "/settings/fire",
      icon: "Landmark",
      category: "Super",
    });
  }

  // 6. Essential spending > 65%
  if (data.essentialRatioPercent > 65) {
    recs.push({
      id: "high-essentials",
      priority: "medium",
      title: "High essential spending ratio",
      description: `${Math.round(data.essentialRatioPercent)}% of your spending is on essentials. Review recurring subscriptions and utilities.`,
      impact: "Freeing up 5% could add hundreds to monthly savings",
      actionHref: "/budget",
      icon: "Scale",
      category: "Budget",
    });
  }

  // 7. Goals behind schedule
  if (data.goalsBehindCount > 0) {
    recs.push({
      id: "goals-behind",
      priority: "medium",
      title: `${data.goalsBehindCount} goal${data.goalsBehindCount === 1 ? " is" : "s are"} behind target`,
      description: `Review your savings goals and consider adjusting contribution amounts or timelines.`,
      impact: "Staying on track prevents last-minute financial stress",
      actionHref: "/goals",
      icon: "Target",
      category: "Goals",
    });
  }

  // 8. Investment rebalancing needed
  if (data.rebalancingNeeded) {
    recs.push({
      id: "rebalancing",
      priority: "low",
      title: "Portfolio needs rebalancing",
      description:
        "One or more asset classes have drifted more than 5% from your target allocation.",
      impact: "Rebalancing maintains your desired risk level",
      actionHref: "/invest",
      icon: "BarChart3",
      category: "Investments",
    });
  }

  // Sort by priority and return top 5
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recs.slice(0, 5);
}

// ============================================================================
// Goal Interaction Analysis
// ============================================================================

export function analyzeGoalInteractions(
  goals: GoalForTimeline[],
  liquidBalanceCents: number,
  monthlyEssentialsCents: number,
  monthlySavingsRateCents: number
): GoalInteraction[] {
  if (monthlyEssentialsCents <= 0) return [];

  const interactions: GoalInteraction[] = [];
  const now = new Date();

  // Sort by deadline
  const sorted = [...goals]
    .filter((g) => !g.is_completed && g.target_amount_cents > 0)
    .sort(
      (a, b) =>
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    );

  let runningBalance = liquidBalanceCents;

  for (const goal of sorted) {
    const targetDate = new Date(goal.deadline);
    if (targetDate <= now) continue;

    // Estimate savings accumulated before this goal's deadline
    const monthsUntil = Math.max(
      0,
      (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );
    const accumulatedSavings = Math.round(
      monthlySavingsRateCents * monthsUntil
    );
    const balanceBeforeGoal = runningBalance + accumulatedSavings;
    const balanceAfterGoal =
      balanceBeforeGoal - goal.target_amount_cents;

    const emergencyFundMonthsAfter =
      balanceAfterGoal / monthlyEssentialsCents;

    if (emergencyFundMonthsAfter < 3) {
      interactions.push({
        goalId: goal.id,
        goalName: goal.name,
        warningMessage:
          emergencyFundMonthsAfter <= 0
            ? `"${goal.name}" would deplete your savings entirely. Consider saving more before this goal.`
            : `"${goal.name}" may reduce your emergency fund to ${emergencyFundMonthsAfter.toFixed(1)} months. Rebuild before your next goal.`,
        emergencyFundMonthsAfter: Math.max(0, emergencyFundMonthsAfter),
      });
    }

    // Update running balance for next goal in sequence
    runningBalance = balanceAfterGoal;
  }

  return interactions;
}
