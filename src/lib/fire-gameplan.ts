// FIRE Gameplan calculation engine
// Composes fire-calculations.ts functions to produce actionable gameplan data
// Pure functions — no side effects, no database access

import {
  calculateCoastFire,
  calculateIncomeImpact,
  calculateSavingsImpact,
  projectFireDate,
  FIRE_MULTIPLIER,
  PRESERVATION_AGE,
  AGE_PENSION_AGE,
  type FireResult,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
} from "./fire-calculations";

// ============================================================================
// Types
// ============================================================================

export interface FireGameplan {
  status: "on-track" | "gap" | "impossible";
  statusSummary: string;
  targetLabel: string;
  progressPercent: number;
  actions: GameplanAction[];
  milestones: FireMilestone[];
  coastFire: CoastFireData;
  savingsRateCurve: SavingsRatePoint[];
  savingsRateImpact: { currentRate: number; plusTenYearsSaved: number | null };
  withdrawalComparison: WithdrawalComparison[];
  etfSuggestions: EtfSuggestion[];
}

export interface GameplanAction {
  type: "save-invest" | "earn-more" | "cut-spending" | "switch-variant";
  priority: "primary" | "secondary" | "alternative";
  headline: string;
  detail: string;
  amountPerMonthCents: number | null;
  impactYears: number | null;
  resultAge: number | null;
}

export interface FireMilestone {
  variant: "coast" | "lean" | "regular" | "fat";
  label: string;
  fireNumberCents: number;
  projectedAge: number | null;
  progressPercent: number;
  isAchieved: boolean;
  isCurrent: boolean;
}

export interface CoastFireData {
  coastNumberCents: number;
  currentPortfolioCents: number;
  progressPercent: number;
  isAchieved: boolean;
  description: string;
}

export interface SavingsRatePoint {
  rate: number;
  yearsToFire: number | null;
  isCurrent: boolean;
}

export interface WithdrawalComparison {
  rate: number;
  label: string;
  fireNumberCents: number;
  note: string;
}

export interface EtfSuggestion {
  ticker: string;
  name: string;
  type: string;
}

// ============================================================================
// Main Orchestrator
// ============================================================================

export function generateFireGameplan(
  fireResult: FireResult,
  fireProfile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData,
  currentAge: number
): FireGameplan {
  const targetAge = fireProfile.targetRetirementAge;
  const projectedAge = fireResult.projectedFireAge;

  // Determine status
  let status: "on-track" | "gap" | "impossible";
  if (projectedAge === null) {
    status = "impossible";
  } else if (targetAge !== null && projectedAge > targetAge) {
    status = "gap";
  } else {
    status = "on-track";
  }

  // Status summary
  const variantLabel =
    fireProfile.fireVariant.charAt(0).toUpperCase() +
    fireProfile.fireVariant.slice(1);
  const ageLabel =
    targetAge !== null ? `by ${targetAge}` : "as early as possible";
  const statusSummary = `${variantLabel} FIRE ${ageLabel}`;
  const targetLabel = formatCentsCompact(fireResult.fireNumberCents) + " target";

  // Generate all sections
  const actions = generateActions(
    fireResult,
    fireProfile,
    spending,
    investments,
    currentAge,
    status
  );

  const milestones = computeMilestones(fireResult, investments, fireProfile.fireVariant);
  const coastFire = computeCoastFire(fireResult, fireProfile, investments, currentAge);
  const savingsRateCurve = computeSavingsRateCurve(
    fireProfile,
    spending,
    investments,
    currentAge
  );

  // Savings rate +10% impact
  const currentRate = Math.round(spending.savingsRatePercent);
  const nextRate = Math.min(currentRate + 10, 80);
  const currentPoint = savingsRateCurve.find((p) => p.isCurrent);
  const nextPoint = savingsRateCurve.find((p) => p.rate === nextRate);
  const plusTenYearsSaved =
    currentPoint?.yearsToFire != null && nextPoint?.yearsToFire != null
      ? currentPoint.yearsToFire - nextPoint.yearsToFire
      : null;

  return {
    status,
    statusSummary,
    targetLabel,
    progressPercent: fireResult.progressPercent,
    actions,
    milestones,
    coastFire,
    savingsRateCurve,
    savingsRateImpact: { currentRate, plusTenYearsSaved },
    withdrawalComparison: computeWithdrawalComparison(
      fireResult.annualExpensesCents
    ),
    etfSuggestions: getEtfSuggestions(),
  };
}

// ============================================================================
// Action Generation
// ============================================================================

function generateActions(
  fireResult: FireResult,
  fireProfile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData,
  currentAge: number,
  status: "on-track" | "gap" | "impossible"
): GameplanAction[] {
  const actions: GameplanAction[] = [];
  const monthlySavingsCents = Math.max(
    0,
    spending.monthlyIncomeCents - spending.monthlyTotalSpendCents
  );

  if (status === "on-track") {
    // Primary action: keep saving and investing
    actions.push({
      type: "save-invest",
      priority: "primary",
      headline: `Save ${formatCentsShort(monthlySavingsCents)}/mo and invest it`,
      detail: "In broad market ETFs like VAS, VGS, or VDHG",
      amountPerMonthCents: monthlySavingsCents,
      impactYears: null,
      resultAge: fireResult.projectedFireAge,
    });
    return actions;
  }

  // For gap and impossible: generate specific action steps
  const effectiveTargetAge =
    fireProfile.targetRetirementAge ??
    (fireResult.projectedFireAge !== null
      ? fireResult.projectedFireAge - 5 // aim 5 years earlier for ASAP
      : currentAge + 15); // fallback: aim for 15 years from now

  // 1. Primary: earn more
  const incomeResult = findRequiredExtraIncome(
    fireResult,
    fireProfile,
    spending,
    investments,
    effectiveTargetAge
  );

  if (incomeResult.extraMonthlyCents > 0) {
    const yearsImpact =
      fireResult.projectedFireAge !== null && incomeResult.resultAge !== null
        ? fireResult.projectedFireAge - incomeResult.resultAge
        : null;

    actions.push({
      type: "earn-more",
      priority: "primary",
      headline: `Earn ${formatCentsShort(incomeResult.extraMonthlyCents)} more per month`,
      detail:
        incomeResult.resultAge !== null
          ? `This closes the gap — FIRE by age ${incomeResult.resultAge}`
          : "This significantly accelerates your FIRE timeline",
      amountPerMonthCents: incomeResult.extraMonthlyCents,
      impactYears: yearsImpact,
      resultAge: incomeResult.resultAge,
    });
  }

  // 2. Secondary: save more / invest current savings
  if (monthlySavingsCents > 0) {
    actions.push({
      type: "save-invest",
      priority: "secondary",
      headline: `Invest your ${formatCentsShort(monthlySavingsCents)}/mo savings`,
      detail: "In broad market ETFs — compound growth is your engine",
      amountPerMonthCents: monthlySavingsCents,
      impactYears: null,
      resultAge: fireResult.projectedFireAge,
    });
  }

  // 3. Secondary: cut spending (only if feasible)
  const savingsResult = findRequiredExtraSavings(
    fireResult,
    fireProfile,
    spending,
    investments,
    effectiveTargetAge
  );

  if (savingsResult.extraMonthlyCents > 0) {
    const discretionaryCents =
      spending.monthlyTotalSpendCents - spending.monthlyEssentialsCents;
    const feasible = savingsResult.extraMonthlyCents <= discretionaryCents;

    if (feasible) {
      actions.push({
        type: "cut-spending",
        priority: "secondary",
        headline: `Cut ${formatCentsShort(savingsResult.extraMonthlyCents)}/mo from spending`,
        detail:
          savingsResult.resultAge !== null
            ? `Reduces your FIRE age to ${savingsResult.resultAge}`
            : "Every dollar saved is a dollar invested",
        amountPerMonthCents: savingsResult.extraMonthlyCents,
        impactYears:
          fireResult.projectedFireAge !== null && savingsResult.resultAge !== null
            ? fireResult.projectedFireAge - savingsResult.resultAge
            : null,
        resultAge: savingsResult.resultAge,
      });
    }
  }

  // 4. Alternative: switch to lean FIRE (if not already lean and lean is faster)
  if (fireProfile.fireVariant !== "lean") {
    const leanVariant = fireResult.variants.find((v) => v.variant === "lean");
    if (
      leanVariant?.projectedAge !== null &&
      leanVariant?.projectedAge !== undefined &&
      (fireResult.projectedFireAge === null ||
        leanVariant.projectedAge < fireResult.projectedFireAge)
    ) {
      actions.push({
        type: "switch-variant",
        priority: "alternative",
        headline: `Switch to Lean FIRE — free by ${leanVariant.projectedAge}`,
        detail: `Essentials-only budget of ${formatCentsShort(leanVariant.annualExpensesCents / 12)}/mo. Needs ${formatCentsCompact(leanVariant.fireNumberCents)}`,
        amountPerMonthCents: null,
        impactYears:
          fireResult.projectedFireAge !== null
            ? fireResult.projectedFireAge - leanVariant.projectedAge
            : null,
        resultAge: leanVariant.projectedAge,
      });
    }
  }

  return actions;
}

// ============================================================================
// Binary Search Functions
// ============================================================================

/**
 * Find the minimum extra monthly income needed to reach FIRE by targetAge.
 * Uses binary search over calculateIncomeImpact().
 */
export function findRequiredExtraIncome(
  fireResult: FireResult,
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData,
  targetAge: number
): { extraMonthlyCents: number; resultAge: number | null } {
  // Already on track?
  if (
    fireResult.projectedFireAge !== null &&
    fireResult.projectedFireAge <= targetAge
  ) {
    return { extraMonthlyCents: 0, resultAge: fireResult.projectedFireAge };
  }

  let low = 0;
  let high = 5_000_000; // $50k/mo in cents
  let bestAmount = high;
  let bestAge: number | null = null;

  for (let i = 0; i < 20; i++) {
    const mid = Math.round((low + high) / 2);
    const impact = calculateIncomeImpact(
      fireResult,
      mid,
      profile,
      spending,
      investments
    );

    if (impact.newFireAge !== null && impact.newFireAge <= targetAge) {
      bestAmount = mid;
      bestAge = impact.newFireAge;
      high = mid;
    } else {
      low = mid;
    }

    if (high - low < 5000) break; // converged to ~$50
  }

  // If we never found a valid result, return the max tested
  if (bestAge === null) {
    const maxImpact = calculateIncomeImpact(
      fireResult,
      high,
      profile,
      spending,
      investments
    );
    return {
      extraMonthlyCents: high,
      resultAge: maxImpact.newFireAge,
    };
  }

  return { extraMonthlyCents: bestAmount, resultAge: bestAge };
}

/**
 * Find the minimum extra monthly savings needed to reach FIRE by targetAge.
 * Capped at discretionary spending (can't cut essentials).
 */
export function findRequiredExtraSavings(
  fireResult: FireResult,
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData,
  targetAge: number
): { extraMonthlyCents: number; resultAge: number | null } {
  if (
    fireResult.projectedFireAge !== null &&
    fireResult.projectedFireAge <= targetAge
  ) {
    return { extraMonthlyCents: 0, resultAge: fireResult.projectedFireAge };
  }

  const discretionaryCents =
    spending.monthlyTotalSpendCents - spending.monthlyEssentialsCents;

  if (discretionaryCents <= 0) {
    return { extraMonthlyCents: 0, resultAge: fireResult.projectedFireAge };
  }

  let low = 0;
  let high = discretionaryCents;
  let bestAmount = high;
  let bestAge: number | null = null;

  for (let i = 0; i < 20; i++) {
    const mid = Math.round((low + high) / 2);
    const impact = calculateSavingsImpact(
      fireResult,
      mid,
      profile,
      spending,
      investments
    );

    if (impact.newFireAge !== null && impact.newFireAge <= targetAge) {
      bestAmount = mid;
      bestAge = impact.newFireAge;
      high = mid;
    } else {
      low = mid;
    }

    if (high - low < 5000) break;
  }

  if (bestAge === null) {
    const maxImpact = calculateSavingsImpact(
      fireResult,
      discretionaryCents,
      profile,
      spending,
      investments
    );
    return {
      extraMonthlyCents: discretionaryCents,
      resultAge: maxImpact.newFireAge,
    };
  }

  return { extraMonthlyCents: bestAmount, resultAge: bestAge };
}

// ============================================================================
// Milestone Computation
// ============================================================================

export function computeMilestones(
  fireResult: FireResult,
  investments: InvestmentData,
  currentVariant: "lean" | "regular" | "fat" | "coast"
): FireMilestone[] {
  const totalPortfolio = investments.outsideSuperCents + investments.superBalanceCents;
  const variantOrder: Array<"coast" | "lean" | "regular" | "fat"> = [
    "coast",
    "lean",
    "regular",
    "fat",
  ];

  return variantOrder.map((variant) => {
    const v = fireResult.variants.find((r) => r.variant === variant);
    const fireNumber = v?.fireNumberCents ?? 0;

    return {
      variant,
      label: variant.charAt(0).toUpperCase() + variant.slice(1),
      fireNumberCents: fireNumber,
      projectedAge: v?.projectedAge ?? null,
      progressPercent: Math.min(100, v?.progressPercent ?? 0),
      isAchieved: fireNumber > 0 && totalPortfolio >= fireNumber,
      isCurrent: variant === currentVariant,
    };
  });
}

// ============================================================================
// Coast FIRE
// ============================================================================

export function computeCoastFire(
  fireResult: FireResult,
  profile: FireProfile,
  investments: InvestmentData,
  currentAge: number
): CoastFireData {
  const targetAge = profile.targetRetirementAge ?? PRESERVATION_AGE;
  const yearsToTarget = Math.max(0, targetAge - currentAge);
  const coastNumber = calculateCoastFire(
    fireResult.fireNumberCents,
    yearsToTarget,
    profile.expectedReturnRate
  );

  const currentPortfolio =
    investments.outsideSuperCents + investments.superBalanceCents;
  const progressPercent =
    coastNumber > 0
      ? Math.min(100, (currentPortfolio / coastNumber) * 100)
      : 100;
  const isAchieved = currentPortfolio >= coastNumber;

  let description: string;
  if (isAchieved) {
    description =
      "Your portfolio will grow to your FIRE target through compound growth alone — you could stop saving aggressively.";
  } else {
    const remaining = coastNumber - currentPortfolio;
    description = `${formatCentsCompact(remaining)} more to Coast FIRE. Once reached, compound growth handles the rest.`;
  }

  return {
    coastNumberCents: coastNumber,
    currentPortfolioCents: currentPortfolio,
    progressPercent,
    isAchieved,
    description,
  };
}

// ============================================================================
// Savings Rate Curve
// ============================================================================

export function computeSavingsRateCurve(
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData,
  currentAge: number
): SavingsRatePoint[] {
  const currentRate = Math.round(spending.savingsRatePercent / 10) * 10;
  const points: SavingsRatePoint[] = [];

  for (let rate = 10; rate <= 80; rate += 10) {
    // Construct modified spending at this savings rate
    const monthlySpendAtRate = Math.round(
      spending.monthlyIncomeCents * (1 - rate / 100)
    );

    if (monthlySpendAtRate < 0) {
      points.push({ rate, yearsToFire: null, isCurrent: rate === currentRate });
      continue;
    }

    const modifiedSpending: SpendingData = {
      ...spending,
      monthlyTotalSpendCents: monthlySpendAtRate,
      // Keep essentials as-is for lean variant calculation
      monthlyEssentialsCents: Math.min(
        spending.monthlyEssentialsCents,
        monthlySpendAtRate
      ),
      savingsRatePercent: rate,
    };

    const result = projectFireDate(profile, modifiedSpending, investments);
    const yearsToFire =
      result.projectedFireAge !== null
        ? result.projectedFireAge - currentAge
        : null;

    points.push({
      rate,
      yearsToFire,
      isCurrent: rate === currentRate,
    });
  }

  return points;
}

// ============================================================================
// Withdrawal Rate Comparison
// ============================================================================

export function computeWithdrawalComparison(
  annualExpensesCents: number
): WithdrawalComparison[] {
  return [
    {
      rate: 0.04,
      label: "4%",
      fireNumberCents: Math.round(annualExpensesCents / 0.04),
      note: "Standard (30yr retirement)",
    },
    {
      rate: 0.035,
      label: "3.5%",
      fireNumberCents: Math.round(annualExpensesCents / 0.035),
      note: "Conservative (50yr+ retirement)",
    },
    {
      rate: 0.03,
      label: "3%",
      fireNumberCents: Math.round(annualExpensesCents / 0.03),
      note: "Ultra-safe (perpetual)",
    },
  ];
}

// ============================================================================
// ETF Suggestions
// ============================================================================

export function getEtfSuggestions(): EtfSuggestion[] {
  return [
    { ticker: "VAS", name: "Vanguard Australian Shares", type: "Australian" },
    { ticker: "VGS", name: "Vanguard Intl Shares", type: "International" },
    {
      ticker: "VDHG",
      name: "Vanguard Diversified High Growth",
      type: "All-in-one",
    },
  ];
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatCentsShort(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${Math.round(dollars).toLocaleString()}`;
  return `$${Math.round(dollars)}`;
}

function formatCentsCompact(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  return `$${Math.round(dollars)}`;
}
