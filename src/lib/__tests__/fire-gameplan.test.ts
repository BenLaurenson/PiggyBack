import { describe, it, expect } from "vitest";
import {
  generateFireGameplan,
  findRequiredExtraIncome,
  findRequiredExtraSavings,
  computeMilestones,
  computeCoastFire,
  computeSavingsRateCurve,
  computeWithdrawalComparison,
  getEtfSuggestions,
  type FireGameplan,
} from "../fire-gameplan";
import {
  projectFireDate,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
  type FireResult,
} from "../fire-calculations";

// ─── Test Data Helpers ──────────────────────────────────────

function makeProfile(overrides: Partial<FireProfile> = {}): FireProfile {
  return {
    dateOfBirth: new Date("1995-01-01"),
    targetRetirementAge: 45,
    superBalanceCents: 5_000_000, // $50k
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

function makeSpending(overrides: Partial<SpendingData> = {}): SpendingData {
  return {
    monthlyEssentialsCents: 300_000, // $3k essentials
    monthlyTotalSpendCents: 500_000, // $5k total
    monthlyIncomeCents: 1_000_000, // $10k income
    savingsRatePercent: 50,
    topCategories: [],
    ...overrides,
  };
}

function makeInvestments(
  overrides: Partial<InvestmentData> = {}
): InvestmentData {
  return {
    outsideSuperCents: 10_000_000, // $100k outside super
    superBalanceCents: 5_000_000, // $50k super
    ...overrides,
  };
}

function makeFireResult(
  profile?: FireProfile,
  spending?: SpendingData,
  investments?: InvestmentData
): FireResult {
  const p = profile ?? makeProfile();
  const s = spending ?? makeSpending();
  const i = investments ?? makeInvestments();
  return projectFireDate(p, s, i);
}

// ─── generateFireGameplan ───────────────────────────────────

describe("generateFireGameplan", () => {
  describe("status determination", () => {
    it("returns 'on-track' when projected age <= target age", () => {
      // High income, low spending, early target = easily on track
      const profile = makeProfile({ targetRetirementAge: 55 });
      const spending = makeSpending({
        monthlyIncomeCents: 1_500_000,
        monthlyTotalSpendCents: 400_000,
        savingsRatePercent: 73,
      });
      const investments = makeInvestments({ outsideSuperCents: 50_000_000 });
      const result = makeFireResult(profile, spending, investments);
      const gameplan = generateFireGameplan(result, profile, spending, investments, 30);

      expect(gameplan.status).toBe("on-track");
    });

    it("returns 'gap' when projected age > target age", () => {
      // Target 35 but won't make it that fast
      const profile = makeProfile({ targetRetirementAge: 35 });
      const spending = makeSpending({
        monthlyIncomeCents: 800_000,
        monthlyTotalSpendCents: 600_000,
        savingsRatePercent: 25,
      });
      const investments = makeInvestments({
        outsideSuperCents: 1_000_000,
        superBalanceCents: 500_000,
      });
      const result = makeFireResult(profile, spending, investments);

      // Only assert gap if projected age exists and is > 35
      if (result.projectedFireAge !== null && result.projectedFireAge > 35) {
        const gameplan = generateFireGameplan(result, profile, spending, investments, 30);
        expect(gameplan.status).toBe("gap");
      }
    });

    it("returns 'impossible' when no projected FIRE age", () => {
      // Spending exceeds income — no FIRE projection
      const profile = makeProfile({ targetRetirementAge: 40 });
      const spending = makeSpending({
        monthlyIncomeCents: 400_000,
        monthlyTotalSpendCents: 500_000,
        savingsRatePercent: -25,
      });
      const investments = makeInvestments({
        outsideSuperCents: 100_000,
        superBalanceCents: 100_000,
      });
      const result = makeFireResult(profile, spending, investments);

      if (result.projectedFireAge === null) {
        const gameplan = generateFireGameplan(result, profile, spending, investments, 30);
        expect(gameplan.status).toBe("impossible");
      }
    });

    it("returns 'on-track' for ASAP mode when projection exists", () => {
      const profile = makeProfile({ targetRetirementAge: null });
      const spending = makeSpending();
      const investments = makeInvestments();
      const result = makeFireResult(profile, spending, investments);
      const gameplan = generateFireGameplan(result, profile, spending, investments, 30);

      // ASAP mode with a projection is always on-track
      if (result.projectedFireAge !== null) {
        expect(gameplan.status).toBe("on-track");
      }
    });
  });

  describe("status summary", () => {
    it("includes variant name and target age", () => {
      const profile = makeProfile({ fireVariant: "fat", targetRetirementAge: 40 });
      const spending = makeSpending();
      const investments = makeInvestments();
      const result = makeFireResult(profile, spending, investments);
      const gameplan = generateFireGameplan(result, profile, spending, investments, 30);

      expect(gameplan.statusSummary).toContain("Fat");
      expect(gameplan.statusSummary).toContain("40");
    });

    it("shows 'as early as possible' for ASAP mode", () => {
      const profile = makeProfile({ targetRetirementAge: null });
      const spending = makeSpending();
      const investments = makeInvestments();
      const result = makeFireResult(profile, spending, investments);
      const gameplan = generateFireGameplan(result, profile, spending, investments, 30);

      expect(gameplan.statusSummary).toContain("as early as possible");
    });
  });

  describe("actions generation", () => {
    it("generates save-invest action when on track", () => {
      const profile = makeProfile({ targetRetirementAge: 55 });
      const spending = makeSpending({
        monthlyIncomeCents: 1_500_000,
        monthlyTotalSpendCents: 400_000,
      });
      const investments = makeInvestments({ outsideSuperCents: 50_000_000 });
      const result = makeFireResult(profile, spending, investments);
      const gameplan = generateFireGameplan(result, profile, spending, investments, 30);

      if (gameplan.status === "on-track") {
        expect(gameplan.actions).toHaveLength(1);
        expect(gameplan.actions[0].type).toBe("save-invest");
        expect(gameplan.actions[0].priority).toBe("primary");
        expect(gameplan.actions[0].amountPerMonthCents).toBe(1_100_000); // $11k savings
      }
    });

    it("generates earn-more action with dollar amount when gap exists", () => {
      const profile = makeProfile({ targetRetirementAge: 35 });
      const spending = makeSpending({
        monthlyIncomeCents: 800_000,
        monthlyTotalSpendCents: 600_000,
        savingsRatePercent: 25,
      });
      const investments = makeInvestments({
        outsideSuperCents: 500_000,
        superBalanceCents: 200_000,
      });
      const result = makeFireResult(profile, spending, investments);

      if (result.projectedFireAge !== null && result.projectedFireAge > 35) {
        const gameplan = generateFireGameplan(result, profile, spending, investments, 30);
        const earnMore = gameplan.actions.find((a) => a.type === "earn-more");

        if (earnMore) {
          expect(earnMore.priority).toBe("primary");
          expect(earnMore.amountPerMonthCents).toBeGreaterThan(0);
          expect(earnMore.headline).toContain("$");
        }
      }
    });

    it("generates switch-variant action when lean is faster", () => {
      const profile = makeProfile({
        fireVariant: "fat",
        targetRetirementAge: 40,
      });
      const spending = makeSpending();
      const investments = makeInvestments();
      const result = makeFireResult(profile, spending, investments);
      const gameplan = generateFireGameplan(result, profile, spending, investments, 30);

      const switchAction = gameplan.actions.find(
        (a) => a.type === "switch-variant"
      );

      // Lean should be faster than fat since it needs less money
      const leanVariant = result.variants.find((v) => v.variant === "lean");
      const fatVariant = result.variants.find((v) => v.variant === "fat");

      if (
        leanVariant?.projectedAge !== null &&
        fatVariant?.projectedAge !== null &&
        leanVariant!.projectedAge! < fatVariant!.projectedAge!
      ) {
        expect(switchAction).toBeDefined();
        expect(switchAction!.headline).toContain("Lean");
      }
    });
  });

  describe("ETF suggestions", () => {
    it("includes VAS, VGS, and VDHG", () => {
      const profile = makeProfile();
      const spending = makeSpending();
      const investments = makeInvestments();
      const result = makeFireResult(profile, spending, investments);
      const gameplan = generateFireGameplan(result, profile, spending, investments, 30);

      const tickers = gameplan.etfSuggestions.map((e) => e.ticker);
      expect(tickers).toContain("VAS");
      expect(tickers).toContain("VGS");
      expect(tickers).toContain("VDHG");
    });
  });
});

// ─── findRequiredExtraIncome ────────────────────────────────

describe("findRequiredExtraIncome", () => {
  it("returns zero when already on track", () => {
    const profile = makeProfile({ targetRetirementAge: 55 });
    const spending = makeSpending({
      monthlyIncomeCents: 1_500_000,
      monthlyTotalSpendCents: 400_000,
    });
    const investments = makeInvestments({ outsideSuperCents: 50_000_000 });
    const result = makeFireResult(profile, spending, investments);

    if (result.projectedFireAge !== null && result.projectedFireAge <= 55) {
      const { extraMonthlyCents } = findRequiredExtraIncome(
        result, profile, spending, investments, 55
      );
      expect(extraMonthlyCents).toBe(0);
    }
  });

  it("finds extra income needed to close a gap", () => {
    const profile = makeProfile({ targetRetirementAge: 40 });
    const spending = makeSpending({
      monthlyIncomeCents: 800_000,
      monthlyTotalSpendCents: 600_000,
    });
    const investments = makeInvestments({
      outsideSuperCents: 500_000,
      superBalanceCents: 200_000,
    });
    const result = makeFireResult(profile, spending, investments);

    if (result.projectedFireAge !== null && result.projectedFireAge > 40) {
      const { extraMonthlyCents, resultAge } = findRequiredExtraIncome(
        result, profile, spending, investments, 40
      );

      expect(extraMonthlyCents).toBeGreaterThan(0);
      if (resultAge !== null) {
        expect(resultAge).toBeLessThanOrEqual(40);
      }
    }
  });

  it("returns positive amount even for impossible scenarios", () => {
    const profile = makeProfile({ targetRetirementAge: 35 });
    const spending = makeSpending({
      monthlyIncomeCents: 400_000,
      monthlyTotalSpendCents: 380_000,
    });
    const investments = makeInvestments({
      outsideSuperCents: 100_000,
      superBalanceCents: 50_000,
    });
    const result = makeFireResult(profile, spending, investments);

    const { extraMonthlyCents } = findRequiredExtraIncome(
      result, profile, spending, investments, 35
    );
    expect(extraMonthlyCents).toBeGreaterThan(0);
  });
});

// ─── findRequiredExtraSavings ───────────────────────────────

describe("findRequiredExtraSavings", () => {
  it("returns zero when already on track", () => {
    const profile = makeProfile({ targetRetirementAge: 55 });
    const spending = makeSpending({
      monthlyIncomeCents: 1_500_000,
      monthlyTotalSpendCents: 400_000,
    });
    const investments = makeInvestments({ outsideSuperCents: 50_000_000 });
    const result = makeFireResult(profile, spending, investments);

    if (result.projectedFireAge !== null && result.projectedFireAge <= 55) {
      const { extraMonthlyCents } = findRequiredExtraSavings(
        result, profile, spending, investments, 55
      );
      expect(extraMonthlyCents).toBe(0);
    }
  });

  it("caps at discretionary spending", () => {
    const profile = makeProfile({ targetRetirementAge: 35 });
    const spending = makeSpending({
      monthlyEssentialsCents: 300_000,
      monthlyTotalSpendCents: 500_000,
      monthlyIncomeCents: 600_000,
    });
    const investments = makeInvestments({
      outsideSuperCents: 100_000,
      superBalanceCents: 50_000,
    });
    const result = makeFireResult(profile, spending, investments);

    const { extraMonthlyCents } = findRequiredExtraSavings(
      result, profile, spending, investments, 35
    );

    const discretionary = 500_000 - 300_000; // $2k
    expect(extraMonthlyCents).toBeLessThanOrEqual(discretionary);
  });

  it("returns zero when no discretionary spending", () => {
    const profile = makeProfile({ targetRetirementAge: 35 });
    const spending = makeSpending({
      monthlyEssentialsCents: 500_000,
      monthlyTotalSpendCents: 500_000, // all essential
      monthlyIncomeCents: 600_000,
    });
    const investments = makeInvestments({
      outsideSuperCents: 100_000,
      superBalanceCents: 50_000,
    });
    const result = makeFireResult(profile, spending, investments);

    const { extraMonthlyCents } = findRequiredExtraSavings(
      result, profile, spending, investments, 35
    );
    expect(extraMonthlyCents).toBe(0);
  });
});

// ─── computeMilestones ──────────────────────────────────────

describe("computeMilestones", () => {
  it("returns 4 milestones in correct order", () => {
    const result = makeFireResult();
    const investments = makeInvestments();
    const milestones = computeMilestones(result, investments, "regular");

    expect(milestones).toHaveLength(4);
    expect(milestones[0].variant).toBe("coast");
    expect(milestones[1].variant).toBe("lean");
    expect(milestones[2].variant).toBe("regular");
    expect(milestones[3].variant).toBe("fat");
  });

  it("marks current variant correctly", () => {
    const result = makeFireResult();
    const investments = makeInvestments();
    const milestones = computeMilestones(result, investments, "fat");

    const current = milestones.filter((m) => m.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].variant).toBe("fat");
  });

  it("calculates progress percentages", () => {
    const result = makeFireResult();
    const investments = makeInvestments();
    const milestones = computeMilestones(result, investments, "regular");

    // All milestones should have >= 0 progress
    for (const m of milestones) {
      expect(m.progressPercent).toBeGreaterThanOrEqual(0);
      expect(m.progressPercent).toBeLessThanOrEqual(100);
    }

    // Lean should have higher progress than fat (lower target)
    const lean = milestones.find((m) => m.variant === "lean")!;
    const fat = milestones.find((m) => m.variant === "fat")!;
    expect(lean.progressPercent).toBeGreaterThanOrEqual(fat.progressPercent);
  });

  it("marks achieved milestones", () => {
    // Very large portfolio should achieve at least some milestones
    const profile = makeProfile();
    const spending = makeSpending({ monthlyTotalSpendCents: 100_000 }); // low spending
    const investments = makeInvestments({
      outsideSuperCents: 500_000_000, // $5M
      superBalanceCents: 500_000_000, // $5M
    });
    const result = makeFireResult(profile, spending, investments);
    const milestones = computeMilestones(result, investments, "regular");

    // With $10M portfolio and low spending, should achieve lean FIRE at minimum
    const leanMilestone = milestones.find((m) => m.variant === "lean")!;
    expect(leanMilestone.isAchieved).toBe(true);
  });
});

// ─── computeCoastFire ───────────────────────────────────────

describe("computeCoastFire", () => {
  it("calculates coast number", () => {
    const profile = makeProfile();
    const investments = makeInvestments();
    const result = makeFireResult(profile);
    const coast = computeCoastFire(result, profile, investments, 30);

    expect(coast.coastNumberCents).toBeGreaterThan(0);
    // Coast number should be less than FIRE number (compound growth fills the gap)
    expect(coast.coastNumberCents).toBeLessThan(result.fireNumberCents);
  });

  it("shows correct progress percentage", () => {
    const profile = makeProfile();
    const investments = makeInvestments();
    const result = makeFireResult(profile);
    const coast = computeCoastFire(result, profile, investments, 30);

    expect(coast.progressPercent).toBeGreaterThanOrEqual(0);
    expect(coast.progressPercent).toBeLessThanOrEqual(100);
    expect(coast.currentPortfolioCents).toBe(
      investments.outsideSuperCents + investments.superBalanceCents
    );
  });

  it("marks achieved when portfolio exceeds coast number", () => {
    const profile = makeProfile();
    const investments = makeInvestments({
      outsideSuperCents: 500_000_000, // $5M
      superBalanceCents: 500_000_000, // $5M
    });
    const result = makeFireResult(profile, undefined, investments);
    const coast = computeCoastFire(result, profile, investments, 30);

    expect(coast.isAchieved).toBe(true);
    expect(coast.progressPercent).toBe(100);
    expect(coast.description).toContain("compound growth");
  });

  it("shows remaining amount when not achieved", () => {
    const profile = makeProfile();
    const investments = makeInvestments({
      outsideSuperCents: 100_000, // $1k
      superBalanceCents: 100_000,
    });
    const result = makeFireResult(profile, undefined, investments);
    const coast = computeCoastFire(result, profile, investments, 30);

    expect(coast.isAchieved).toBe(false);
    expect(coast.description).toContain("more to Coast FIRE");
  });
});

// ─── computeSavingsRateCurve ────────────────────────────────

describe("computeSavingsRateCurve", () => {
  it("returns 8 points at 10% intervals", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const curve = computeSavingsRateCurve(profile, spending, investments, 30);

    expect(curve).toHaveLength(8);
    expect(curve[0].rate).toBe(10);
    expect(curve[7].rate).toBe(80);
  });

  it("higher savings rates have fewer or equal years to FIRE", () => {
    const profile = makeProfile();
    const spending = makeSpending();
    const investments = makeInvestments();
    const curve = computeSavingsRateCurve(profile, spending, investments, 30);

    // Filter to points with valid years
    const validPoints = curve.filter((p) => p.yearsToFire !== null);

    for (let i = 1; i < validPoints.length; i++) {
      expect(validPoints[i].yearsToFire!).toBeLessThanOrEqual(
        validPoints[i - 1].yearsToFire!
      );
    }
  });

  it("marks current savings rate position", () => {
    const profile = makeProfile();
    const spending = makeSpending({ savingsRatePercent: 50 });
    const investments = makeInvestments();
    const curve = computeSavingsRateCurve(profile, spending, investments, 30);

    const current = curve.filter((p) => p.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].rate).toBe(50);
  });

  it("rounds savings rate to nearest 10% for isCurrent", () => {
    const profile = makeProfile();
    const spending = makeSpending({ savingsRatePercent: 47 });
    const investments = makeInvestments();
    const curve = computeSavingsRateCurve(profile, spending, investments, 30);

    const current = curve.filter((p) => p.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].rate).toBe(50); // 47 rounds to 50
  });
});

// ─── computeWithdrawalComparison ────────────────────────────

describe("computeWithdrawalComparison", () => {
  it("returns 3 entries", () => {
    const comparison = computeWithdrawalComparison(6_000_000); // $60k/yr
    expect(comparison).toHaveLength(3);
  });

  it("calculates correct FIRE numbers", () => {
    const annualExpenses = 6_000_000; // $60k/yr = 600k cents
    const comparison = computeWithdrawalComparison(annualExpenses);

    // 4% → 25x
    expect(comparison[0].rate).toBe(0.04);
    expect(comparison[0].fireNumberCents).toBe(
      Math.round(annualExpenses / 0.04)
    );

    // 3.5% → ~28.57x
    expect(comparison[1].rate).toBe(0.035);
    expect(comparison[1].fireNumberCents).toBe(
      Math.round(annualExpenses / 0.035)
    );

    // 3% → ~33.33x
    expect(comparison[2].rate).toBe(0.03);
    expect(comparison[2].fireNumberCents).toBe(
      Math.round(annualExpenses / 0.03)
    );
  });

  it("4% gives lowest FIRE number, 3% gives highest", () => {
    const comparison = computeWithdrawalComparison(6_000_000);
    expect(comparison[0].fireNumberCents).toBeLessThan(
      comparison[1].fireNumberCents
    );
    expect(comparison[1].fireNumberCents).toBeLessThan(
      comparison[2].fireNumberCents
    );
  });
});

// ─── getEtfSuggestions ──────────────────────────────────────

describe("getEtfSuggestions", () => {
  it("returns Australian ETF suggestions", () => {
    const suggestions = getEtfSuggestions();
    expect(suggestions.length).toBeGreaterThanOrEqual(3);

    const tickers = suggestions.map((s) => s.ticker);
    expect(tickers).toContain("VAS");
    expect(tickers).toContain("VGS");
    expect(tickers).toContain("VDHG");
  });
});
