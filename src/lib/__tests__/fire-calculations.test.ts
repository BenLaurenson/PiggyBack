import { describe, it, expect } from "vitest";
import {
  calculateAge,
  calculateAnnualExpenses,
  calculateFireNumber,
  calculateTwoBucket,
  calculateCoastFire,
  projectFireDate,
  calculateSavingsImpact,
  calculateIncomeImpact,
  calculateIncomeMilestones,
  generateRecommendations,
  PRESERVATION_AGE,
  AGE_PENSION_AGE,
  FIRE_MULTIPLIER,
  FAT_FIRE_MULTIPLIER,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
} from "../fire-calculations";

// ============================================================================
// Test Helpers
// ============================================================================

function makeProfile(overrides?: Partial<FireProfile>): FireProfile {
  return {
    dateOfBirth: new Date("1995-06-15"),
    targetRetirementAge: null,
    superBalanceCents: 5000000, // $50k
    superContributionRate: 11.5,
    expectedReturnRate: 7.0,
    outsideSuperReturnRate: null,
    incomeGrowthRate: 0,
    spendingGrowthRate: 0,
    fireVariant: "regular",
    annualExpenseOverrideCents: null,
    ...overrides,
  };
}

function makeSpending(overrides?: Partial<SpendingData>): SpendingData {
  return {
    monthlyEssentialsCents: 250000, // $2,500
    monthlyTotalSpendCents: 400000, // $4,000
    monthlyIncomeCents: 700000, // $7,000
    savingsRatePercent: 42.9,
    topCategories: [
      { name: "Food & Dining", amountCents: 80000 },
      { name: "Entertainment", amountCents: 50000 },
    ],
    ...overrides,
  };
}

function makeInvestments(overrides?: Partial<InvestmentData>): InvestmentData {
  return {
    outsideSuperCents: 10000000, // $100k
    superBalanceCents: 5000000, // $50k
    ...overrides,
  };
}

// ============================================================================
// calculateAge
// ============================================================================

describe("calculateAge", () => {
  it("calculates age correctly for a past birthday this year", () => {
    const dob = new Date("1995-01-15");
    const now = new Date("2026-06-15");
    expect(calculateAge(dob, now)).toBe(31);
  });

  it("calculates age correctly before birthday this year", () => {
    const dob = new Date("1995-08-20");
    const now = new Date("2026-06-15");
    expect(calculateAge(dob, now)).toBe(30);
  });

  it("calculates age correctly on birthday", () => {
    const dob = new Date("1995-06-15");
    const now = new Date("2026-06-15");
    expect(calculateAge(dob, now)).toBe(31);
  });

  it("handles leap year birthday", () => {
    const dob = new Date("2000-02-29");
    const now = new Date("2026-02-28");
    expect(calculateAge(dob, now)).toBe(25);
  });

  it("returns 0 for newborn", () => {
    const dob = new Date("2026-06-15");
    const now = new Date("2026-06-15");
    expect(calculateAge(dob, now)).toBe(0);
  });
});

// ============================================================================
// calculateAnnualExpenses
// ============================================================================

describe("calculateAnnualExpenses", () => {
  const spending = makeSpending();

  it("lean uses essentials only", () => {
    const result = calculateAnnualExpenses(spending, "lean", null);
    expect(result).toBe(250000 * 12); // $2,500 × 12 = $30,000
  });

  it("regular uses total spend", () => {
    const result = calculateAnnualExpenses(spending, "regular", null);
    expect(result).toBe(400000 * 12); // $4,000 × 12 = $48,000
  });

  it("fat uses total × 1.25", () => {
    const result = calculateAnnualExpenses(spending, "fat", null);
    expect(result).toBe(Math.round(400000 * 12 * FAT_FIRE_MULTIPLIER));
  });

  it("coast uses total spend (same as regular)", () => {
    const result = calculateAnnualExpenses(spending, "coast", null);
    expect(result).toBe(400000 * 12);
  });

  it("override takes precedence for any variant", () => {
    const override = 6000000; // $60k
    expect(calculateAnnualExpenses(spending, "lean", override)).toBe(override);
    expect(calculateAnnualExpenses(spending, "regular", override)).toBe(override);
    expect(calculateAnnualExpenses(spending, "fat", override)).toBe(override);
  });

  it("ignores zero override", () => {
    const result = calculateAnnualExpenses(spending, "regular", 0);
    expect(result).toBe(400000 * 12);
  });

  it("ignores negative override", () => {
    const result = calculateAnnualExpenses(spending, "regular", -100);
    expect(result).toBe(400000 * 12);
  });
});

// ============================================================================
// calculateFireNumber
// ============================================================================

describe("calculateFireNumber", () => {
  it("equals annual expenses × 25", () => {
    expect(calculateFireNumber(4800000)).toBe(4800000 * 25); // $48k × 25 = $1.2M
  });

  it("handles zero expenses", () => {
    expect(calculateFireNumber(0)).toBe(0);
  });

  it("uses FIRE_MULTIPLIER constant", () => {
    expect(FIRE_MULTIPLIER).toBe(25);
    expect(calculateFireNumber(100)).toBe(100 * FIRE_MULTIPLIER);
  });
});

// ============================================================================
// calculateTwoBucket
// ============================================================================

describe("calculateTwoBucket", () => {
  const investments = makeInvestments();

  it("calculates outside-super need for age 25 retiring at 35", () => {
    const annualExpenses = 4800000; // $48k
    const result = calculateTwoBucket(annualExpenses, 25, 35, investments);

    // 60 - 35 = 25 years of outside-super needed
    expect(result.yearsPreRetirement).toBe(25);
    expect(result.outsideSuperTargetCents).toBe(annualExpenses * 25);
  });

  it("calculates for age 45 retiring at 50", () => {
    const annualExpenses = 4800000;
    const result = calculateTwoBucket(annualExpenses, 45, 50, investments);

    expect(result.yearsPreRetirement).toBe(10); // 60 - 50
    expect(result.outsideSuperTargetCents).toBe(annualExpenses * 10);
  });

  it("needs no outside-super for retirement at 62 (past preservation age)", () => {
    const annualExpenses = 4800000;
    const result = calculateTwoBucket(annualExpenses, 55, 62, investments);

    expect(result.yearsPreRetirement).toBe(0);
    expect(result.outsideSuperTargetCents).toBe(0);
    expect(result.outsideSuperProgressPercent).toBe(100);
  });

  it("super target is always expenses × 25", () => {
    const annualExpenses = 4800000;
    const result = calculateTwoBucket(annualExpenses, 30, 40, investments);
    expect(result.superTargetCents).toBe(annualExpenses * 25);
  });

  it("calculates progress percentages", () => {
    const annualExpenses = 4800000;
    const result = calculateTwoBucket(annualExpenses, 30, 40, investments);

    expect(result.outsideSuperProgressPercent).toBeGreaterThan(0);
    expect(result.outsideSuperProgressPercent).toBeLessThanOrEqual(100);
    expect(result.superProgressPercent).toBeGreaterThan(0);
    expect(result.superProgressPercent).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// calculateCoastFire
// ============================================================================

describe("calculateCoastFire", () => {
  it("coast number is less than FIRE number (compound growth discounting)", () => {
    const fireNumber = 120000000; // $1.2M
    const coast = calculateCoastFire(fireNumber, 30, 7.0);
    expect(coast).toBeLessThan(fireNumber);
    expect(coast).toBeGreaterThan(0);
  });

  it("with 0 years, coast equals FIRE number", () => {
    const fireNumber = 120000000;
    const coast = calculateCoastFire(fireNumber, 0, 7.0);
    expect(coast).toBe(fireNumber);
  });

  it("higher return rate means lower coast number", () => {
    const fireNumber = 120000000;
    const coastLow = calculateCoastFire(fireNumber, 20, 5.0);
    const coastHigh = calculateCoastFire(fireNumber, 20, 9.0);
    expect(coastHigh).toBeLessThan(coastLow);
  });

  it("more years means lower coast number", () => {
    const fireNumber = 120000000;
    const coast10 = calculateCoastFire(fireNumber, 10, 7.0);
    const coast30 = calculateCoastFire(fireNumber, 30, 7.0);
    expect(coast30).toBeLessThan(coast10);
  });

  it("negative years returns FIRE number", () => {
    const fireNumber = 120000000;
    expect(calculateCoastFire(fireNumber, -5, 7.0)).toBe(fireNumber);
  });
});

// ============================================================================
// projectFireDate
// ============================================================================

describe("projectFireDate", () => {
  it("returns a projected FIRE date for a standard profile", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);

    expect(result.currentAge).toBeGreaterThan(0);
    expect(result.fireNumberCents).toBeGreaterThan(0);
    expect(result.projectedFireDate).toBeInstanceOf(Date);
    expect(result.projectedFireAge).toBeGreaterThan(result.currentAge);
    expect(result.variants).toHaveLength(4);
  });

  it("returns all four variants", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    const variantNames = result.variants.map((v) => v.variant);

    expect(variantNames).toContain("lean");
    expect(variantNames).toContain("regular");
    expect(variantNames).toContain("fat");
    expect(variantNames).toContain("coast");
  });

  it("lean FIRE is reached before regular FIRE", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    const lean = result.variants.find((v) => v.variant === "lean")!;
    const regular = result.variants.find((v) => v.variant === "regular")!;

    if (lean.projectedAge && regular.projectedAge) {
      expect(lean.projectedAge).toBeLessThanOrEqual(regular.projectedAge);
    }
  });

  it("fat FIRE is reached after regular FIRE", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    const regular = result.variants.find((v) => v.variant === "regular")!;
    const fat = result.variants.find((v) => v.variant === "fat")!;

    if (regular.projectedAge && fat.projectedAge) {
      expect(fat.projectedAge).toBeGreaterThanOrEqual(regular.projectedAge);
    }
  });

  it("generates projection data for chart", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    expect(result.projectionData.length).toBeGreaterThan(0);
    expect(result.projectionData[0].age).toBe(result.currentAge);
    expect(result.projectionData[0].outsideSuperCents).toBe(investments.outsideSuperCents);
  });

  it("handles zero income (no savings)", () => {
    const profile = makeProfile();
    const spending = makeSpending({ monthlyIncomeCents: 0, savingsRatePercent: 0 });
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    // Should still project something (compound growth on existing investments)
    expect(result.projectionData.length).toBeGreaterThan(0);
  });

  it("handles zero spending", () => {
    const profile = makeProfile();
    const spending = makeSpending({
      monthlyEssentialsCents: 0,
      monthlyTotalSpendCents: 0,
      savingsRatePercent: 100,
    });
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    // FIRE number is 0, so already achieved
    expect(result.fireNumberCents).toBe(0);
  });

  it("handles person already past preservation age", () => {
    const profile = makeProfile({
      dateOfBirth: new Date("1960-01-01"), // ~66 years old
    });
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    expect(result.currentAge).toBeGreaterThanOrEqual(60);
  });

  it("handles no super balance", () => {
    const profile = makeProfile({ superBalanceCents: 0 });
    const spending = makeSpending();
    const investments = makeInvestments({ superBalanceCents: 0 });

    const result = projectFireDate(profile, spending, investments);
    expect(result.projectedFireDate).toBeInstanceOf(Date);
  });
});

// ============================================================================
// calculateSavingsImpact
// ============================================================================

describe("calculateSavingsImpact", () => {
  it("extra savings moves FIRE date earlier", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    const impact = calculateSavingsImpact(result, 50000, profile, spending, investments);

    if (impact.originalFireAge && impact.newFireAge) {
      expect(impact.newFireAge).toBeLessThanOrEqual(impact.originalFireAge);
    }
    if (impact.yearsSaved !== null) {
      expect(impact.yearsSaved).toBeGreaterThanOrEqual(0);
    }
  });

  it("zero extra savings has no impact", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    const impact = calculateSavingsImpact(result, 0, profile, spending, investments);

    expect(impact.yearsSaved).toBe(0);
  });

  it("large extra savings has significant impact", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();

    const result = projectFireDate(profile, spending, investments);
    const small = calculateSavingsImpact(result, 10000, profile, spending, investments);
    const large = calculateSavingsImpact(result, 200000, profile, spending, investments);

    if (small.yearsSaved !== null && large.yearsSaved !== null) {
      expect(large.yearsSaved).toBeGreaterThanOrEqual(small.yearsSaved);
    }
  });
});

// ============================================================================
// generateRecommendations
// ============================================================================

describe("generateRecommendations", () => {
  it("recommends cutting spending when savings rate < 20%", () => {
    const profile = makeProfile();
    const spending = makeSpending({
      savingsRatePercent: 10,
      monthlyIncomeCents: 700000,
    });
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const recs = generateRecommendations(result, spending, profile);
    expect(recs.some((r) => r.type === "cut-spending")).toBe(true);
  });

  it("recommends income growth for high savers with low income", () => {
    const profile = makeProfile();
    const spending = makeSpending({
      savingsRatePercent: 60,
      monthlyIncomeCents: 500000, // $5k — under $8k threshold
    });
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const recs = generateRecommendations(result, spending, profile);
    expect(recs.some((r) => r.type === "increase-income")).toBe(true);
  });

  it("recommends salary sacrifice when on default SG rate", () => {
    const profile = makeProfile({ superContributionRate: 11.5 });
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const recs = generateRecommendations(result, spending, profile);
    expect(recs.some((r) => r.type === "salary-sacrifice")).toBe(true);
  });

  it("shows on-track for good savings rate with no other issues", () => {
    const profile = makeProfile({ superContributionRate: 15 }); // Above SG
    const spending = makeSpending({
      savingsRatePercent: 40,
      monthlyIncomeCents: 1000000, // $10k — above $8k threshold
    });
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const recs = generateRecommendations(result, spending, profile);
    expect(recs.some((r) => r.type === "on-track")).toBe(true);
  });
});

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Separate Return Rates
// ============================================================================

describe("separate return rates", () => {
  it("uses outsideSuperReturnRate for outside-super when set", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profileHigh = makeProfile({ outsideSuperReturnRate: 9.0, expectedReturnRate: 5.0 });
    const profileLow = makeProfile({ outsideSuperReturnRate: null, expectedReturnRate: 5.0 });

    const resultHigh = projectFireDate(profileHigh, spending, investments);
    const resultLow = projectFireDate(profileLow, spending, investments);

    if (resultHigh.projectedFireAge && resultLow.projectedFireAge) {
      expect(resultHigh.projectedFireAge).toBeLessThanOrEqual(resultLow.projectedFireAge);
    }
  });

  it("falls back to expectedReturnRate when outsideSuperReturnRate is null", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profileA = makeProfile({ expectedReturnRate: 7.0, outsideSuperReturnRate: null });
    const profileB = makeProfile({ expectedReturnRate: 7.0, outsideSuperReturnRate: 7.0 });

    const resultA = projectFireDate(profileA, spending, investments);
    const resultB = projectFireDate(profileB, spending, investments);

    expect(resultA.projectedFireAge).toBe(resultB.projectedFireAge);
  });

  it("projection data uses separate rates", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profileSame = makeProfile({ expectedReturnRate: 7.0, outsideSuperReturnRate: null });
    const profileDiff = makeProfile({ expectedReturnRate: 5.0, outsideSuperReturnRate: 9.0 });

    const resultSame = projectFireDate(profileSame, spending, investments);
    const resultDiff = projectFireDate(profileDiff, spending, investments);

    // With 9% outside and 5% super vs 7% both, the outside-super bucket
    // should grow faster in the differentiated case
    if (resultDiff.projectionData.length > 2 && resultSame.projectionData.length > 2) {
      const diffOutside = resultDiff.projectionData[2].outsideSuperCents;
      const sameOutside = resultSame.projectionData[2].outsideSuperCents;
      expect(diffOutside).toBeGreaterThan(sameOutside);
    }
  });
});

// ============================================================================
// Income Growth Rate
// ============================================================================

describe("income growth rate", () => {
  it("income growth accelerates FIRE date", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profileGrowth = makeProfile({ incomeGrowthRate: 3.0 });
    const profileNoGrowth = makeProfile({ incomeGrowthRate: 0 });

    const resultGrowth = projectFireDate(profileGrowth, spending, investments);
    const resultNoGrowth = projectFireDate(profileNoGrowth, spending, investments);

    if (resultGrowth.projectedFireAge && resultNoGrowth.projectedFireAge) {
      expect(resultGrowth.projectedFireAge).toBeLessThanOrEqual(resultNoGrowth.projectedFireAge);
    }
  });

  it("zero income growth matches current behavior", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profile = makeProfile({ incomeGrowthRate: 0 });
    const result = projectFireDate(profile, spending, investments);
    expect(result.projectedFireAge).toBeGreaterThan(result.currentAge);
  });
});

// ============================================================================
// Spending Growth Rate
// ============================================================================

describe("spending growth rate", () => {
  it("spending growth delays FIRE date", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profileInflation = makeProfile({ spendingGrowthRate: 3.0 });
    const profileNoInflation = makeProfile({ spendingGrowthRate: 0 });

    const resultInflation = projectFireDate(profileInflation, spending, investments);
    const resultNoInflation = projectFireDate(profileNoInflation, spending, investments);

    if (resultInflation.projectedFireAge && resultNoInflation.projectedFireAge) {
      expect(resultInflation.projectedFireAge).toBeGreaterThanOrEqual(resultNoInflation.projectedFireAge);
    }
  });

  it("projection data shows growing FIRE target with spending growth", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profile = makeProfile({ spendingGrowthRate: 3.0 });
    const result = projectFireDate(profile, spending, investments);

    if (result.projectionData.length > 2) {
      // FIRE target should increase each year with spending growth
      expect(result.projectionData[2].fireTargetCents).toBeGreaterThan(
        result.projectionData[0].fireTargetCents
      );
    }
  });

  it("zero spending growth keeps FIRE target constant", () => {
    const spending = makeSpending();
    const investments = makeInvestments();

    const profile = makeProfile({ spendingGrowthRate: 0 });
    const result = projectFireDate(profile, spending, investments);

    if (result.projectionData.length > 2) {
      expect(result.projectionData[2].fireTargetCents).toBe(
        result.projectionData[0].fireTargetCents
      );
    }
  });
});

// ============================================================================
// calculateIncomeImpact
// ============================================================================

describe("calculateIncomeImpact", () => {
  it("extra income moves FIRE date earlier", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const impact = calculateIncomeImpact(result, 100000, profile, spending, investments);

    if (impact.originalFireAge && impact.newFireAge) {
      expect(impact.newFireAge).toBeLessThanOrEqual(impact.originalFireAge);
    }
    if (impact.yearsSaved !== null) {
      expect(impact.yearsSaved).toBeGreaterThanOrEqual(0);
    }
  });

  it("zero extra income has no impact", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const impact = calculateIncomeImpact(result, 0, profile, spending, investments);

    expect(impact.yearsSaved).toBe(0);
    expect(impact.extraAnnualSavingsCents).toBe(0);
    expect(impact.extraSuperContributionCents).toBe(0);
  });

  it("larger income increase has greater or equal impact", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const small = calculateIncomeImpact(result, 50000, profile, spending, investments);
    const large = calculateIncomeImpact(result, 300000, profile, spending, investments);

    if (small.yearsSaved !== null && large.yearsSaved !== null) {
      expect(large.yearsSaved).toBeGreaterThanOrEqual(small.yearsSaved);
    }
  });

  it("calculates extra super contribution correctly", () => {
    const profile = makeProfile({ superContributionRate: 11.5 });
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const impact = calculateIncomeImpact(result, 100000, profile, spending, investments);

    // $1k/mo = $12k/yr, super at 11.5% = $1,380/yr
    expect(impact.extraAnnualSavingsCents).toBe(1200000);
    expect(impact.extraSuperContributionCents).toBe(138000);
  });

  it("keeps FIRE number unchanged (spending stays the same)", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    // Income increase doesn't change spending, so FIRE number stays the same
    const modifiedSpending: SpendingData = {
      ...spending,
      monthlyIncomeCents: spending.monthlyIncomeCents + 200000,
      savingsRatePercent: 0, // recalculated internally
    };
    const newResult = projectFireDate(profile, modifiedSpending, investments);

    expect(newResult.fireNumberCents).toBe(result.fireNumberCents);
  });
});

// ============================================================================
// calculateIncomeMilestones
// ============================================================================

describe("calculateIncomeMilestones", () => {
  it("returns up to 4 milestones", () => {
    const profile = makeProfile();
    const spending = makeSpending(); // $7k/mo = $84k/yr
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const milestones = calculateIncomeMilestones(result, profile, spending, investments);

    expect(milestones.length).toBeGreaterThan(0);
    expect(milestones.length).toBeLessThanOrEqual(4);
  });

  it("milestones are at sensible income levels above current", () => {
    const profile = makeProfile();
    const spending = makeSpending(); // $84k/yr
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const milestones = calculateIncomeMilestones(result, profile, spending, investments);
    const currentAnnual = spending.monthlyIncomeCents * 12;

    for (const m of milestones) {
      expect(m.annualIncomeCents).toBeGreaterThan(currentAnnual);
    }
  });

  it("higher income milestones have earlier or equal FIRE ages", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const milestones = calculateIncomeMilestones(result, profile, spending, investments);

    for (let i = 1; i < milestones.length; i++) {
      if (milestones[i].fireAge !== null && milestones[i - 1].fireAge !== null) {
        expect(milestones[i].fireAge).toBeLessThanOrEqual(milestones[i - 1].fireAge!);
      }
    }
  });

  it("milestones show years saved relative to current", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const milestones = calculateIncomeMilestones(result, profile, spending, investments);

    for (const m of milestones) {
      if (m.yearsSaved !== null) {
        expect(m.yearsSaved).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ============================================================================
// generateRecommendations with investments (income-leverage)
// ============================================================================

describe("generateRecommendations income-leverage", () => {
  it("includes income-leverage recommendation when investments provided", () => {
    const profile = makeProfile({ superContributionRate: 15 }); // above SG to avoid salary-sacrifice
    const spending = makeSpending({
      savingsRatePercent: 30,
      monthlyIncomeCents: 700000,
    });
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const recs = generateRecommendations(result, spending, profile, investments);
    expect(recs.some((r) => r.type === "income-leverage")).toBe(true);
  });

  it("income-leverage shows concrete years saved", () => {
    const profile = makeProfile({ superContributionRate: 15 });
    const spending = makeSpending({
      savingsRatePercent: 30,
      monthlyIncomeCents: 700000,
    });
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    const recs = generateRecommendations(result, spending, profile, investments);
    const leverage = recs.find((r) => r.type === "income-leverage");
    if (leverage) {
      expect(leverage.description).toMatch(/year/);
      expect(leverage.title).toBe("The Bigger Shovel");
    }
  });

  it("backward compatible — works without investments param", () => {
    const profile = makeProfile();
    const spending = makeSpending({ savingsRatePercent: 10 });
    const investments = makeInvestments();
    const result = projectFireDate(profile, spending, investments);

    // Call without investments (old signature)
    const recs = generateRecommendations(result, spending, profile);
    // Should not throw and should not include income-leverage
    expect(recs.some((r) => r.type === "income-leverage")).toBe(false);
  });
});

// ============================================================================
// Constants
// ============================================================================

describe("constants", () => {
  it("PRESERVATION_AGE is 60", () => {
    expect(PRESERVATION_AGE).toBe(60);
  });

  it("AGE_PENSION_AGE is 67", () => {
    expect(AGE_PENSION_AGE).toBe(67);
  });

  it("FIRE_MULTIPLIER is 25 (4% rule)", () => {
    expect(FIRE_MULTIPLIER).toBe(25);
  });

  it("FAT_FIRE_MULTIPLIER is 1.25", () => {
    expect(FAT_FIRE_MULTIPLIER).toBe(1.25);
  });
});
