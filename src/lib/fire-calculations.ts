// FIRE (Financial Independence, Retire Early) calculation engine
// Pure functions — no side effects, no database access

// ============================================================================
// Constants
// ============================================================================

/** Australian super preservation age */
export const PRESERVATION_AGE = 60;

/** Australian Age Pension eligibility age */
export const AGE_PENSION_AGE = 67;

/** Standard safe withdrawal rate (4% rule) */
const SAFE_WITHDRAWAL_RATE = 0.04;

/** Default superannuation guarantee rate (2025–26) */
const DEFAULT_SG_RATE = 11.5;

/** Multiplier for FIRE number (1 / SWR) */
export const FIRE_MULTIPLIER = 1 / SAFE_WITHDRAWAL_RATE; // 25

/** Fat FIRE multiplier over regular spending */
export const FAT_FIRE_MULTIPLIER = 1.25;

// ============================================================================
// Types
// ============================================================================

export interface FireProfile {
  dateOfBirth: Date;
  targetRetirementAge: number | null; // null = "as soon as possible"
  superBalanceCents: number;
  superContributionRate: number; // percentage, e.g. 11.5
  expectedReturnRate: number; // percentage, e.g. 7.0 — used for super bucket
  outsideSuperReturnRate: number | null; // when null, falls back to expectedReturnRate
  incomeGrowthRate: number; // annual %, e.g. 3.0
  spendingGrowthRate: number; // annual %, e.g. 2.0 (inflation)
  fireVariant: "lean" | "regular" | "fat" | "coast";
  annualExpenseOverrideCents: number | null;
}

export interface SpendingData {
  monthlyEssentialsCents: number;
  monthlyTotalSpendCents: number;
  monthlyIncomeCents: number;
  savingsRatePercent: number;
  topCategories: { name: string; amountCents: number }[];
}

export interface InvestmentData {
  outsideSuperCents: number; // total investments outside super
  superBalanceCents: number;
}

export interface FireVariantResult {
  variant: "lean" | "regular" | "fat" | "coast";
  annualExpensesCents: number;
  fireNumberCents: number;
  projectedDate: Date | null;
  projectedAge: number | null;
  progressPercent: number;
}

export interface TwoBucketBreakdown {
  outsideSuperTargetCents: number;
  outsideSuperCurrentCents: number;
  outsideSuperProgressPercent: number;
  superTargetCents: number;
  superCurrentCents: number;
  superProgressPercent: number;
  yearsPreRetirement: number; // years from retirement to preservation age
  yearsPostPreservation: number; // years from preservation age onward
}

export interface FireResult {
  currentAge: number;
  targetAge: number | null;
  fireNumberCents: number;
  annualExpensesCents: number;
  twoBucket: TwoBucketBreakdown;
  progressPercent: number;
  projectedFireDate: Date | null;
  projectedFireAge: number | null;
  yearsToFire: number | null;
  variants: FireVariantResult[];
  projectionData: ProjectionYear[];
}

export interface ProjectionYear {
  age: number;
  year: number;
  outsideSuperCents: number;
  superCents: number;
  totalCents: number;
  fireTargetCents: number;
}

export interface FireRecommendation {
  type: "cut-spending" | "increase-income" | "salary-sacrifice" | "on-track" | "coast-achieved" | "income-leverage";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  actionHref?: string;
}

export interface SavingsImpactResult {
  originalFireDate: Date | null;
  newFireDate: Date | null;
  yearsSaved: number | null;
  originalFireAge: number | null;
  newFireAge: number | null;
}

export interface IncomeImpactResult {
  originalFireAge: number | null;
  newFireAge: number | null;
  yearsSaved: number | null;
  extraAnnualSavingsCents: number;
  extraSuperContributionCents: number;
}

export interface IncomeMilestone {
  annualIncomeCents: number;
  fireAge: number | null;
  yearsSaved: number | null;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate age from date of birth
 */
export function calculateAge(dob: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Calculate annual expenses based on FIRE variant
 */
export function calculateAnnualExpenses(
  spending: SpendingData,
  variant: "lean" | "regular" | "fat" | "coast",
  overrideCents: number | null
): number {
  if (overrideCents !== null && overrideCents > 0) {
    return overrideCents;
  }

  switch (variant) {
    case "lean":
      return spending.monthlyEssentialsCents * 12;
    case "regular":
    case "coast":
      return spending.monthlyTotalSpendCents * 12;
    case "fat":
      return Math.round(spending.monthlyTotalSpendCents * 12 * FAT_FIRE_MULTIPLIER);
  }
}

/**
 * Calculate FIRE number using the 4% rule
 * FIRE number = annual expenses × 25
 */
export function calculateFireNumber(annualExpensesCents: number): number {
  return annualExpensesCents * FIRE_MULTIPLIER;
}

/**
 * Calculate two-bucket breakdown for Australian FIRE
 *
 * Before preservation age (60): need outside-super to cover expenses
 * After preservation age: can draw from super
 *
 * If retiring after 60, all funds can come from super + outside-super pool
 */
export function calculateTwoBucket(
  annualExpensesCents: number,
  currentAge: number,
  targetRetirementAge: number,
  investments: InvestmentData
): TwoBucketBreakdown {
  // If retiring at or after preservation age, outside-super only
  // needs to bridge until super access — which is zero
  const yearsPreRetirement = Math.max(0, PRESERVATION_AGE - targetRetirementAge);
  const yearsPostPreservation = FIRE_MULTIPLIER; // 25 years of expenses from super

  const outsideSuperTargetCents = annualExpensesCents * yearsPreRetirement;
  const superTargetCents = annualExpensesCents * yearsPostPreservation;

  const outsideSuperProgressPercent = outsideSuperTargetCents > 0
    ? Math.min(100, (investments.outsideSuperCents / outsideSuperTargetCents) * 100)
    : 100; // No outside-super needed

  const superProgressPercent = superTargetCents > 0
    ? Math.min(100, (investments.superBalanceCents / superTargetCents) * 100)
    : 100;

  return {
    outsideSuperTargetCents,
    outsideSuperCurrentCents: investments.outsideSuperCents,
    outsideSuperProgressPercent,
    superTargetCents,
    superCurrentCents: investments.superBalanceCents,
    superProgressPercent,
    yearsPreRetirement,
    yearsPostPreservation,
  };
}

/**
 * Calculate Coast FIRE number
 *
 * Coast FIRE = the amount you need invested NOW such that compound growth
 * alone will hit your FIRE number by target age (no further contributions needed)
 */
export function calculateCoastFire(
  fireNumberCents: number,
  yearsToTarget: number,
  annualReturnRate: number // e.g. 7.0
): number {
  if (yearsToTarget <= 0) return fireNumberCents;
  const rate = annualReturnRate / 100;
  return Math.round(fireNumberCents / Math.pow(1 + rate, yearsToTarget));
}

/**
 * Project year-by-year FIRE trajectory
 *
 * Outside-super grows by: discretionary savings (income - spending - SG) + investment returns
 * Super grows by: employer contributions (SG%) + investment returns
 */
export function projectFireDate(
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData
): FireResult {
  const now = new Date();
  const currentAge = calculateAge(profile.dateOfBirth, now);
  const returnRate = profile.expectedReturnRate / 100;

  // Calculate all four variants
  const variants: FireVariantResult[] = (
    ["lean", "regular", "fat", "coast"] as const
  ).map((variant) => {
    const annualExpenses = calculateAnnualExpenses(
      spending,
      variant,
      variant === profile.fireVariant ? profile.annualExpenseOverrideCents : null
    );
    const fireNumber = calculateFireNumber(annualExpenses);

    // Run projection for this variant
    const projection = runProjection(
      currentAge,
      profile,
      spending,
      investments,
      annualExpenses,
      fireNumber,
      variant
    );

    const totalCurrent = investments.outsideSuperCents + investments.superBalanceCents;
    const progress = fireNumber > 0 ? Math.min(100, (totalCurrent / fireNumber) * 100) : 0;

    return {
      variant,
      annualExpensesCents: annualExpenses,
      fireNumberCents: fireNumber,
      projectedDate: projection.fireDate,
      projectedAge: projection.fireAge,
      progressPercent: progress,
    };
  });

  // Use the selected variant for the main result
  const selected = variants.find((v) => v.variant === profile.fireVariant)!;
  const annualExpenses = selected.annualExpensesCents;
  const fireNumber = selected.fireNumberCents;

  // Target age: user-specified or projected
  const targetAge = profile.targetRetirementAge ?? selected.projectedAge;

  // Two-bucket breakdown
  const twoBucket = calculateTwoBucket(
    annualExpenses,
    currentAge,
    targetAge ?? AGE_PENSION_AGE,
    investments
  );

  // Full projection data for chart
  const projectionData = generateProjectionData(
    currentAge,
    profile,
    spending,
    investments,
    annualExpenses,
    fireNumber
  );

  const yearsToFire = selected.projectedAge !== null
    ? selected.projectedAge - currentAge
    : null;

  return {
    currentAge,
    targetAge,
    fireNumberCents: fireNumber,
    annualExpensesCents: annualExpenses,
    twoBucket,
    progressPercent: selected.progressPercent,
    projectedFireDate: selected.projectedDate,
    projectedFireAge: selected.projectedAge,
    yearsToFire,
    variants,
    projectionData,
  };
}

/**
 * Calculate the impact of additional monthly savings on FIRE date
 */
export function calculateSavingsImpact(
  result: FireResult,
  extraMonthlyCents: number,
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData
): SavingsImpactResult {
  if (extraMonthlyCents <= 0) {
    return {
      originalFireDate: result.projectedFireDate,
      newFireDate: result.projectedFireDate,
      yearsSaved: 0,
      originalFireAge: result.projectedFireAge,
      newFireAge: result.projectedFireAge,
    };
  }

  // Create modified spending data with extra savings
  const modifiedSpending: SpendingData = {
    ...spending,
    monthlyTotalSpendCents: spending.monthlyTotalSpendCents - extraMonthlyCents,
    monthlyEssentialsCents: spending.monthlyEssentialsCents,
    savingsRatePercent: spending.monthlyIncomeCents > 0
      ? ((spending.monthlyIncomeCents - spending.monthlyTotalSpendCents + extraMonthlyCents) / spending.monthlyIncomeCents) * 100
      : 0,
  };

  const newResult = projectFireDate(profile, modifiedSpending, investments);

  const yearsSaved =
    result.projectedFireAge !== null && newResult.projectedFireAge !== null
      ? result.projectedFireAge - newResult.projectedFireAge
      : null;

  return {
    originalFireDate: result.projectedFireDate,
    newFireDate: newResult.projectedFireDate,
    yearsSaved,
    originalFireAge: result.projectedFireAge,
    newFireAge: newResult.projectedFireAge,
  };
}

/**
 * Calculate the impact of additional monthly income on FIRE date.
 * Unlike savings impact (which reduces spending AND FIRE target),
 * income impact keeps spending the same and increases savings capacity.
 */
export function calculateIncomeImpact(
  result: FireResult,
  extraMonthlyIncomeCents: number,
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData
): IncomeImpactResult {
  if (extraMonthlyIncomeCents <= 0) {
    return {
      originalFireAge: result.projectedFireAge,
      newFireAge: result.projectedFireAge,
      yearsSaved: 0,
      extraAnnualSavingsCents: 0,
      extraSuperContributionCents: 0,
    };
  }

  const newMonthlyIncome = spending.monthlyIncomeCents + extraMonthlyIncomeCents;
  const modifiedSpending: SpendingData = {
    ...spending,
    monthlyIncomeCents: newMonthlyIncome,
    savingsRatePercent: newMonthlyIncome > 0
      ? ((newMonthlyIncome - spending.monthlyTotalSpendCents) / newMonthlyIncome) * 100
      : 0,
  };

  const newResult = projectFireDate(profile, modifiedSpending, investments);

  const extraAnnualIncome = extraMonthlyIncomeCents * 12;
  const extraSuperContribution = Math.round(
    (extraAnnualIncome * profile.superContributionRate) / 100
  );

  return {
    originalFireAge: result.projectedFireAge,
    newFireAge: newResult.projectedFireAge,
    yearsSaved:
      result.projectedFireAge !== null && newResult.projectedFireAge !== null
        ? result.projectedFireAge - newResult.projectedFireAge
        : null,
    extraAnnualSavingsCents: extraAnnualIncome,
    extraSuperContributionCents: extraSuperContribution,
  };
}

/**
 * Calculate FIRE dates at various income milestone levels.
 * Generates 4 milestones above current income at sensible intervals.
 */
export function calculateIncomeMilestones(
  result: FireResult,
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData
): IncomeMilestone[] {
  const currentAnnualIncome = spending.monthlyIncomeCents * 12;
  const currentDollars = currentAnnualIncome / 100;

  // Round up to nearest $10k
  const base = Math.ceil(currentDollars / 10000) * 10000;

  // Step size scales with income
  const step =
    currentDollars < 80000 ? 10000 : currentDollars < 150000 ? 20000 : 30000;

  const milestones: IncomeMilestone[] = [];
  for (let i = 1; i <= 4; i++) {
    const targetDollars = base + step * i;
    const targetCents = targetDollars * 100;
    const extraMonthlyCents = Math.round(
      (targetCents - currentAnnualIncome) / 12
    );

    if (extraMonthlyCents <= 0) continue;

    const impact = calculateIncomeImpact(
      result,
      extraMonthlyCents,
      profile,
      spending,
      investments
    );
    milestones.push({
      annualIncomeCents: targetCents,
      fireAge: impact.newFireAge,
      yearsSaved: impact.yearsSaved,
    });
  }

  return milestones;
}

/**
 * Generate actionable recommendations based on FIRE progress
 */
export function generateRecommendations(
  result: FireResult,
  spending: SpendingData,
  profile: FireProfile,
  investments?: InvestmentData
): FireRecommendation[] {
  const recommendations: FireRecommendation[] = [];

  // Coast FIRE achieved?
  if (profile.fireVariant === "coast") {
    const coastVariant = result.variants.find((v) => v.variant === "coast")!;
    const coastNumber = calculateCoastFire(
      coastVariant.fireNumberCents,
      (result.targetAge ?? AGE_PENSION_AGE) - result.currentAge,
      profile.expectedReturnRate
    );
    const totalInvested =
      result.twoBucket.outsideSuperCurrentCents + result.twoBucket.superCurrentCents;

    if (totalInvested >= coastNumber) {
      recommendations.push({
        type: "coast-achieved",
        priority: "low",
        title: "Coast FIRE Achieved",
        description:
          "Your investments can grow to your FIRE number without any further contributions. You could stop saving aggressively and let compound growth do the work.",
        impact: `Your portfolio of ${formatCentsShort(totalInvested)} exceeds the Coast FIRE target of ${formatCentsShort(coastNumber)}.`,
      });
    }
  }

  // Low savings rate
  if (spending.savingsRatePercent < 20 && spending.monthlyIncomeCents > 0) {
    recommendations.push({
      type: "cut-spending",
      priority: "high",
      title: "Boost Your Savings Rate",
      description: `Your savings rate is ${spending.savingsRatePercent.toFixed(0)}%. Increasing to 20%+ significantly accelerates your FIRE timeline.`,
      impact: spending.topCategories.length > 0
        ? `Top spending: ${spending.topCategories[0].name} (${formatCentsShort(spending.topCategories[0].amountCents)}/mo)`
        : "Review your spending categories for opportunities.",
      actionHref: "/activity",
    });
  }

  // High savings rate but low income — earning more has higher leverage
  if (
    spending.savingsRatePercent >= 50 &&
    spending.monthlyIncomeCents > 0 &&
    spending.monthlyIncomeCents < 800000 // < $8k/mo
  ) {
    recommendations.push({
      type: "increase-income",
      priority: "medium",
      title: "Focus on Income Growth",
      description:
        "Your savings rate is excellent. At this point, increasing income has more impact than further cuts.",
      impact: `A $500/mo raise at your savings rate saves an extra ${formatCentsShort(50000 * 12)}/year.`,
    });
  }

  // Income leverage insight — show concrete impact of a raise
  if (
    investments &&
    profile.fireVariant !== "coast" &&
    result.yearsToFire !== null &&
    result.yearsToFire > 3 &&
    spending.monthlyIncomeCents > 0
  ) {
    const testRaise = 100000; // $1k/mo
    const impact = calculateIncomeImpact(
      result,
      testRaise,
      profile,
      spending,
      investments
    );
    if (impact.yearsSaved !== null && impact.yearsSaved > 0) {
      recommendations.push({
        type: "income-leverage",
        priority: "medium",
        title: "The Bigger Shovel",
        description: `A $1,000/mo income increase would move your FIRE date ${impact.yearsSaved} ${impact.yearsSaved === 1 ? "year" : "years"} earlier. Extra income also boosts super by ${formatCentsShort(impact.extraSuperContributionCents)}/year.`,
        impact:
          "You can cut expenses to a floor, but income has no ceiling. Focus on skills, promotions, or side income.",
      });
    }
  }

  // Salary sacrifice suggestion
  if (profile.superContributionRate <= DEFAULT_SG_RATE) {
    recommendations.push({
      type: "salary-sacrifice",
      priority: "medium",
      title: "Consider Salary Sacrifice",
      description:
        "You're only on the standard SG rate. Salary sacrificing extra into super is tax-advantaged and grows your super bucket faster.",
      impact:
        "Contributions taxed at 15% inside super vs your marginal rate outside. Check your concessional cap ($30k/year).",
      actionHref: "/settings/fire",
    });
  }

  // On track
  if (
    spending.savingsRatePercent >= 20 &&
    result.progressPercent > 0 &&
    recommendations.length === 0
  ) {
    recommendations.push({
      type: "on-track",
      priority: "low",
      title: "You're on Track",
      description: `With a ${spending.savingsRatePercent.toFixed(0)}% savings rate, you're making solid progress toward FIRE.`,
      impact: result.yearsToFire !== null
        ? `Projected FIRE in ~${result.yearsToFire} years.`
        : "Keep going — consistency is key.",
    });
  }

  return recommendations;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function runProjection(
  currentAge: number,
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData,
  annualExpensesCents: number,
  fireNumberCents: number,
  variant: "lean" | "regular" | "fat" | "coast"
): { fireDate: Date | null; fireAge: number | null } {
  const superReturnRate = profile.expectedReturnRate / 100;
  const outsideReturnRate = (profile.outsideSuperReturnRate ?? profile.expectedReturnRate) / 100;
  const incomeGrowthRate = (profile.incomeGrowthRate || 0) / 100;
  const spendingGrowthRate = (profile.spendingGrowthRate || 0) / 100;

  let outsideSuper = investments.outsideSuperCents;
  let superBalance = investments.superBalanceCents;
  let currentAnnualIncome = spending.monthlyIncomeCents * 12;
  let currentAnnualSpending = spending.monthlyTotalSpendCents * 12;
  let currentFireTarget = fireNumberCents;

  const maxAge = 100;

  for (let age = currentAge; age <= maxAge; age++) {
    const total = outsideSuper + superBalance;

    // For coast FIRE, check if current investments will grow to FIRE number
    if (variant === "coast") {
      const yearsToTarget =
        (profile.targetRetirementAge ?? AGE_PENSION_AGE) - age;
      if (yearsToTarget >= 0) {
        const coastTarget = calculateCoastFire(
          currentFireTarget,
          yearsToTarget,
          profile.expectedReturnRate
        );
        if (total >= coastTarget) {
          const fireDate = new Date();
          fireDate.setFullYear(fireDate.getFullYear() + (age - currentAge));
          return { fireDate, fireAge: age };
        }
      }
    } else {
      // Standard FIRE check: total portfolio >= FIRE number
      if (total >= currentFireTarget) {
        const fireDate = new Date();
        fireDate.setFullYear(fireDate.getFullYear() + (age - currentAge));
        return { fireDate, fireAge: age };
      }
    }

    // Calculate this year's savings and employer super (SG) contribution.
    // In Australia, employer super is paid ON TOP of salary — it does not
    // reduce take-home pay.  The SG contribution is separate money the
    // employer puts into the super fund.  We must avoid double-counting it
    // by both including it in the outside-super savings AND adding it to
    // the super bucket.  Only the super bucket receives the SG amount;
    // outside-super receives the remaining discretionary savings.
    const annualSuperContribution = Math.round(
      (currentAnnualIncome * profile.superContributionRate) / 100
    );
    const annualSavings = currentAnnualIncome - currentAnnualSpending;
    const outsideSuperSavings = Math.max(0, annualSavings) - annualSuperContribution;

    // Grow investments (separate rates per bucket)
    outsideSuper = Math.round(outsideSuper * (1 + outsideReturnRate) + Math.max(0, outsideSuperSavings));
    superBalance = Math.round(superBalance * (1 + superReturnRate) + annualSuperContribution);

    // Grow income and spending for next year
    if (incomeGrowthRate > 0) {
      currentAnnualIncome = Math.round(currentAnnualIncome * (1 + incomeGrowthRate));
    }
    if (spendingGrowthRate > 0) {
      currentAnnualSpending = Math.round(currentAnnualSpending * (1 + spendingGrowthRate));
      // FIRE target also grows with spending
      currentFireTarget = Math.round(currentFireTarget * (1 + spendingGrowthRate));
    }
  }

  return { fireDate: null, fireAge: null };
}

export function generateProjectionData(
  currentAge: number,
  profile: FireProfile,
  spending: SpendingData,
  investments: InvestmentData,
  annualExpensesCents: number,
  fireNumberCents: number
): ProjectionYear[] {
  const superReturnRate = profile.expectedReturnRate / 100;
  const outsideReturnRate = (profile.outsideSuperReturnRate ?? profile.expectedReturnRate) / 100;
  const incomeGrowthRate = (profile.incomeGrowthRate || 0) / 100;
  const spendingGrowthRate = (profile.spendingGrowthRate || 0) / 100;

  const data: ProjectionYear[] = [];
  let outsideSuper = investments.outsideSuperCents;
  let superBalance = investments.superBalanceCents;
  let currentAnnualIncome = spending.monthlyIncomeCents * 12;
  let currentAnnualSpending = spending.monthlyTotalSpendCents * 12;
  let currentFireTarget = fireNumberCents;
  const currentYear = new Date().getFullYear();

  // Project until FIRE or age 80, whichever comes first
  const maxAge = Math.min(80, currentAge + 50);

  for (let age = currentAge; age <= maxAge; age++) {
    data.push({
      age,
      year: currentYear + (age - currentAge),
      outsideSuperCents: outsideSuper,
      superCents: superBalance,
      totalCents: outsideSuper + superBalance,
      fireTargetCents: currentFireTarget,
    });

    // Stop projecting beyond FIRE target
    if (outsideSuper + superBalance >= currentFireTarget && age > currentAge) {
      break;
    }

    const annualSuperContribution = Math.round(
      (currentAnnualIncome * profile.superContributionRate) / 100
    );
    const annualSavings = currentAnnualIncome - currentAnnualSpending;
    const outsideSuperSavings = Math.max(0, annualSavings) - annualSuperContribution;

    outsideSuper = Math.round(outsideSuper * (1 + outsideReturnRate) + Math.max(0, outsideSuperSavings));
    superBalance = Math.round(superBalance * (1 + superReturnRate) + annualSuperContribution);

    // Grow income and spending for next year
    if (incomeGrowthRate > 0) {
      currentAnnualIncome = Math.round(currentAnnualIncome * (1 + incomeGrowthRate));
    }
    if (spendingGrowthRate > 0) {
      currentAnnualSpending = Math.round(currentAnnualSpending * (1 + spendingGrowthRate));
      currentFireTarget = Math.round(currentFireTarget * (1 + spendingGrowthRate));
    }
  }

  return data;
}

function formatCentsShort(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  return `$${dollars.toFixed(0)}`;
}
