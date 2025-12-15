import { createClient } from "@/utils/supabase/server";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { getCurrentDate } from "@/lib/demo-guard";
import { PlanClient } from "@/components/plan/plan-client";
import { classifySpending } from "@/lib/fire-spending-classifier";
import {
  calculateAge,
  projectFireDate,
  generateRecommendations,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
} from "@/lib/fire-calculations";
import {
  generateHealthMetrics,
  generatePriorityRecommendations,
  calculateSuperCapRoom,
  analyzeGoalInteractions,
  type HealthMetricInputs,
} from "@/lib/plan-health-calculations";
import { generateFireGameplan } from "@/lib/fire-gameplan";
import { calculateRebalancing } from "@/lib/portfolio-aggregation";
import type { AnnualCheckupData } from "@/components/plan/plan-client";
import type { GoalTimelineData } from "@/components/plan/goals-timeline";

function getCurrentFinancialYear(): number {
  const now = getCurrentDate();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6">Please log in</div>;
  }

  const now = getCurrentDate();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Batch 1: Independent queries
  const [
    partnershipId,
    { data: profile },
    { data: accounts },
    { data: categoryMappings },
  ] = await Promise.all([
    getUserPartnershipId(supabase, user.id),
    supabase
      .from("profiles")
      .select(
        "date_of_birth, target_retirement_age, super_balance_cents, super_contribution_rate, expected_return_rate, outside_super_return_rate, income_growth_rate, spending_growth_rate, fire_variant, annual_expense_override_cents, fire_onboarded"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("accounts")
      .select("id, balance_cents, account_type, display_name")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("category_mappings")
      .select("up_category_id, new_parent_name, new_child_name"),
  ]);

  // Check if FIRE is set up
  const fireOnboarded =
    profile?.fire_onboarded === true && !!profile?.date_of_birth;

  const allAccounts = accounts || [];
  const accountIds = allAccounts.map((a) => a.id);

  // Calculate liquid balance (SAVER + TRANSACTIONAL) and home loan balance
  const liquidBalanceCents = allAccounts
    .filter(
      (a) => a.account_type === "SAVER" || a.account_type === "TRANSACTIONAL"
    )
    .reduce((sum, a) => sum + (a.balance_cents || 0), 0);

  const homeLoanBalanceCents = allAccounts
    .filter((a) => a.account_type === "HOME_LOAN")
    .reduce((sum, a) => sum + Math.abs(a.balance_cents || 0), 0);

  const hasDebt = homeLoanBalanceCents > 0;

  // Batch 2: Queries that depend on accountIds/partnershipId
  const [
    { data: transactions },
    { data: investments },
    { data: incomeSources },
    { data: netWorthSnapshots },
    { data: savingsGoals },
    { data: expenseDefinitions },
    { data: checkups },
    { data: targetAllocations },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "amount_cents, category_id, parent_category_id, is_income, is_internal_transfer, created_at"
      )
      .in("account_id", accountIds.length > 0 ? accountIds : ["__none__"])
      .is("transfer_account_id", null)
      .gte("created_at", twelveMonthsAgo.toISOString())
      .lte("created_at", endOfMonth.toISOString()),
    supabase
      .from("investments")
      .select("current_value_cents, asset_type")
      .eq("partnership_id", partnershipId),
    supabase
      .from("income_sources")
      .select("amount_cents, frequency")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("source_type", "recurring-salary")
      .eq("is_manual_partner_income", false),
    supabase
      .from("net_worth_snapshots")
      .select("snapshot_date, total_balance_cents, investment_total_cents")
      .eq("partnership_id", partnershipId)
      .order("snapshot_date", { ascending: false })
      .limit(30),
    supabase
      .from("savings_goals")
      .select("*, linked_account:accounts!savings_goals_linked_account_id_fkey(display_name)")
      .eq("partnership_id", partnershipId),
    supabase
      .from("expense_definitions")
      .select("id, expense_matches!left(id, transaction_id, transactions(settled_at, created_at))")
      .eq("partnership_id", partnershipId)
      .eq("is_active", true),
    supabase
      .from("annual_checkups")
      .select("*")
      .eq("partnership_id", partnershipId)
      .eq("financial_year", getCurrentFinancialYear())
      .maybeSingle(),
    supabase
      .from("target_allocations")
      .select("asset_type, target_percentage")
      .eq("partnership_id", partnershipId),
  ]);

  const txns = transactions || [];
  const mappings = categoryMappings || [];

  // ============================================================================
  // Shared calculations
  // ============================================================================

  // Classify spending
  const { essentialCents, discretionaryCents } = classifySpending(
    txns,
    mappings
  );

  // Calculate monthly averages (over 12 months)
  const monthCount = Math.max(
    1,
    Math.min(
      12,
      Math.ceil(
        (endOfMonth.getTime() - twelveMonthsAgo.getTime()) /
          (1000 * 60 * 60 * 24 * 30)
      )
    )
  );

  const totalExpenseCents = txns
    .filter(
      (t) => t.amount_cents < 0 && !t.is_income && !t.is_internal_transfer
    )
    .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0);

  const totalIncomeCents = txns
    .filter(
      (t) => (t.amount_cents > 0 || t.is_income) && !t.is_internal_transfer
    )
    .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0);

  const monthlyEssentialsCents = Math.round(essentialCents / monthCount);
  const monthlyTotalSpendCents = Math.round(totalExpenseCents / monthCount);
  const txnMonthlyIncomeCents = Math.round(totalIncomeCents / monthCount);

  // Prefer income_sources (frequency-aware) over transaction averages when available
  const incomeSourceAnnual = (incomeSources || []).reduce((sum, src) => {
    const amount = src.amount_cents || 0;
    switch (src.frequency) {
      case "weekly":
        return sum + amount * 52;
      case "fortnightly":
        return sum + amount * 26;
      case "monthly":
        return sum + amount * 12;
      case "annually":
        return sum + amount;
      default:
        return sum + amount * 12;
    }
  }, 0);
  const monthlyIncomeCents =
    incomeSourceAnnual > 0
      ? Math.round(incomeSourceAnnual / 12)
      : txnMonthlyIncomeCents;

  const savingsRate =
    monthlyIncomeCents > 0
      ? ((monthlyIncomeCents - monthlyTotalSpendCents) / monthlyIncomeCents) *
        100
      : 0;

  // Top spending categories
  const categoryTotals = new Map<string, number>();
  for (const txn of txns) {
    if (txn.amount_cents >= 0 || txn.is_income || txn.is_internal_transfer)
      continue;
    const catId = txn.category_id || txn.parent_category_id;
    if (!catId) continue;
    const mapping = mappings.find((m) => m.up_category_id === catId);
    const name = mapping?.new_parent_name || "Other";
    categoryTotals.set(
      name,
      (categoryTotals.get(name) || 0) + Math.abs(txn.amount_cents)
    );
  }

  const topCategories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, total]) => ({
      name,
      amountCents: Math.round(total / monthCount),
    }));

  // ============================================================================
  // FIRE calculations (only if onboarded)
  // ============================================================================

  let fireResult = null;
  let fireRecommendations: ReturnType<typeof generateRecommendations> = [];
  let fireProfile: FireProfile | null = null;
  let currentAge: number | null = null;
  let spending: SpendingData | null = null;
  let investmentData: InvestmentData | null = null;
  let fireGameplan: ReturnType<typeof generateFireGameplan> | null = null;

  if (fireOnboarded && profile) {
    spending = {
      monthlyEssentialsCents,
      monthlyTotalSpendCents,
      monthlyIncomeCents,
      savingsRatePercent: Math.max(0, savingsRate),
      topCategories,
    };

    const outsideSuperCents = (investments || []).reduce(
      (sum, inv) => sum + (inv.current_value_cents || 0),
      0
    );

    investmentData = {
      outsideSuperCents,
      superBalanceCents: profile.super_balance_cents || 0,
    };

    fireProfile = {
      dateOfBirth: new Date(profile.date_of_birth),
      targetRetirementAge: profile.target_retirement_age,
      superBalanceCents: profile.super_balance_cents || 0,
      superContributionRate:
        Number(profile.super_contribution_rate) || 11.5,
      expectedReturnRate: Number(profile.expected_return_rate) || 7.0,
      outsideSuperReturnRate: profile.outside_super_return_rate != null
        ? Number(profile.outside_super_return_rate)
        : null,
      incomeGrowthRate: Number(profile.income_growth_rate) || 0,
      spendingGrowthRate: Number(profile.spending_growth_rate) || 0,
      fireVariant: profile.fire_variant || "regular",
      annualExpenseOverrideCents: profile.annual_expense_override_cents,
    };

    currentAge = calculateAge(fireProfile.dateOfBirth, now);
    fireResult = projectFireDate(fireProfile, spending, investmentData);
    fireRecommendations = generateRecommendations(
      fireResult,
      spending,
      fireProfile,
      investmentData
    );
    fireGameplan = generateFireGameplan(
      fireResult,
      fireProfile,
      spending,
      investmentData,
      currentAge
    );
  }

  // ============================================================================
  // Plan tab calculations
  // ============================================================================

  // Bills payment rate — count active expenses with a matched transaction in current month
  const allExpenseDefs = expenseDefinitions || [];
  const totalExpenseDefinitions = allExpenseDefs.length;
  const matchedExpenseCount = allExpenseDefs.filter((e: any) => {
    return e.expense_matches?.some((m: any) => {
      const txn = m.transactions;
      if (!txn) return false;
      const settledAt = txn.settled_at || txn.created_at;
      if (!settledAt) return false;
      const txnDate = new Date(settledAt);
      return txnDate >= startOfMonth && txnDate <= endOfMonth;
    });
  }).length;

  // Goals summary
  const goalsData = (savingsGoals || []).map((g) => ({
    current_amount_cents: g.current_amount_cents || 0,
    target_amount_cents: g.target_amount_cents || 0,
    is_completed: g.is_completed || false,
  }));

  // Annual income (reuse frequency-aware calculation from above)
  const annualIncomeCents = incomeSourceAnnual > 0
    ? incomeSourceAnnual
    : txnMonthlyIncomeCents * 12;

  // Health metrics
  const healthMetricInputs: HealthMetricInputs = {
    netWorthSnapshots: (netWorthSnapshots || []).map((s) => ({
      snapshot_date: s.snapshot_date,
      total_balance_cents: s.total_balance_cents,
      investment_total_cents: s.investment_total_cents,
    })),
    monthlyIncomeCents,
    monthlySpendingCents: monthlyTotalSpendCents,
    previousSavingsRates: [], // We don't track historical rates yet
    liquidBalanceCents,
    monthlyEssentialsCents,
    goals: goalsData,
    essentialCents,
    discretionaryCents,
    totalExpenseDefinitions,
    matchedExpenseCount,
    homeLoanBalanceCents,
    annualIncomeCents,
  };

  const healthMetrics = generateHealthMetrics(healthMetricInputs);

  // Emergency fund months for recommendations
  const emergencyFundMonths =
    monthlyEssentialsCents > 0
      ? liquidBalanceCents / monthlyEssentialsCents
      : 0;

  // Essential ratio for recommendations
  const totalSpend = essentialCents + discretionaryCents;
  const essentialRatioPercent =
    totalSpend > 0 ? (essentialCents / totalSpend) * 100 : 0;

  // Super cap room
  const sgRate = profile?.super_contribution_rate
    ? Number(profile.super_contribution_rate)
    : 11.5;
  const superCapRoom = calculateSuperCapRoom(annualIncomeCents, sgRate);

  // Rebalancing check
  const currentInvestments = investments || [];
  const allTargets = targetAllocations || [];
  const totalInvestmentCents = currentInvestments.reduce(
    (sum, inv) => sum + (inv.current_value_cents || 0),
    0
  );

  // Aggregate current allocation by asset_type
  const allocationMap = new Map<string, number>();
  for (const inv of currentInvestments) {
    const type = (inv as any).asset_type || "Other";
    allocationMap.set(type, (allocationMap.get(type) || 0) + (inv.current_value_cents || 0));
  }
  const currentAllocation = [...allocationMap.entries()].map(
    ([assetType, valueCents]) => ({ assetType, valueCents })
  );

  const rebalanceDeltas = calculateRebalancing(
    currentAllocation,
    allTargets,
    totalInvestmentCents
  );
  const rebalancingNeeded = rebalanceDeltas.some(
    (d) => Math.abs(d.deltaPercent) > 5
  );

  // Goals behind count (goals with < 40% progress)
  const activeGoals = goalsData.filter((g) => !g.is_completed);
  const goalsBehindCount = activeGoals.filter((g) => {
    if (g.target_amount_cents <= 0) return false;
    return g.current_amount_cents / g.target_amount_cents < 0.4;
  }).length;

  // Unpaid bills count
  const unpaidBillsCount = totalExpenseDefinitions - matchedExpenseCount;

  // Goals with deadlines for recommendations and timeline
  const goalsWithDeadlines = (savingsGoals || [])
    .filter((g: any) => g.deadline)
    .map((g: any) => ({
      id: g.id,
      name: g.name,
      deadline: g.deadline,
      target_amount_cents: g.target_amount_cents || 0,
      is_completed: g.is_completed || false,
    }));

  const priorityRecommendations = generatePriorityRecommendations({
    healthMetrics,
    emergencyFundMonths,
    savingsRatePercent: Math.max(0, savingsRate),
    essentialRatioPercent,
    superCapRoomCents: superCapRoom.remainingCents,
    rebalancingNeeded,
    goalsBehindCount,
    unpaidBillsCount,
    upcomingGoals: goalsWithDeadlines,
    liquidBalanceCents,
  });

  // Goal interactions
  const monthlySavingsCents = Math.max(
    0,
    monthlyIncomeCents - monthlyTotalSpendCents
  );
  const goalInteractions = analyzeGoalInteractions(
    goalsWithDeadlines,
    liquidBalanceCents,
    monthlyEssentialsCents,
    monthlySavingsCents
  );

  // Format goals for timeline
  const timelineGoals: GoalTimelineData[] = (savingsGoals || [])
    .filter((g: any) => g.deadline)
    .map((g: any) => ({
      id: g.id,
      name: g.name,
      description: g.description || null,
      deadline: g.deadline,
      target_amount_cents: g.target_amount_cents || 0,
      current_amount_cents: g.current_amount_cents || 0,
      estimated_monthly_impact_cents: g.estimated_monthly_impact_cents || 0,
      icon: g.icon || "target",
      color: g.color || "var(--pastel-blue)",
      is_completed: g.is_completed || false,
      completed_at: g.completed_at,
      preparation_checklist: g.preparation_checklist || [],
      sort_order: g.sort_order || 0,
      linked_account_name: g.linked_account?.display_name || null,
    }));

  // Format checkup for client
  const currentCheckup: AnnualCheckupData | null = checkups
    ? {
        id: checkups.id,
        financial_year: checkups.financial_year,
        current_step: checkups.current_step || 1,
        step_data: (checkups.step_data as Record<string, unknown>) || {},
        action_items: (checkups.action_items as any[]) || [],
        started_at: checkups.started_at,
        completed_at: checkups.completed_at,
      }
    : null;

  // Checkup review data
  const hasInvestments = (investments || []).length > 0;
  const hasSuperProfile = !!profile?.super_balance_cents;

  // Monthly discretionary spending
  const monthlyDiscretionaryCents = Math.round(discretionaryCents / monthCount);

  // Goals totals
  const goalsTotalSavedCents = activeGoals.reduce((sum, g) => sum + g.current_amount_cents, 0);
  const goalsTotalTargetCents = activeGoals.reduce((sum, g) => sum + g.target_amount_cents, 0);

  // HOME_LOAN account count
  const homeLoanAccountCount = allAccounts.filter((a) => a.account_type === "HOME_LOAN").length;

  // Investment allocation with percentages
  const investmentAllocation = currentAllocation.map((a) => ({
    assetType: a.assetType,
    valueCents: a.valueCents,
    percent: totalInvestmentCents > 0 ? (a.valueCents / totalInvestmentCents) * 100 : 0,
  }));

  // Priority recommendations summary for step 7
  const priorityRecommendationsSummary = priorityRecommendations.map((r) => ({
    title: r.title,
    priority: r.priority,
  }));

  return (
    <PlanClient
      fireOnboarded={fireOnboarded}
      fireResult={fireResult}
      recommendations={fireRecommendations}
      fireProfile={fireProfile}
      spending={spending}
      investments={investmentData}
      currentAge={currentAge}
      savingsRate={Math.max(0, savingsRate)}
      fireGameplan={fireGameplan}
      healthMetrics={healthMetrics}
      priorityRecommendations={priorityRecommendations}
      timelineGoals={timelineGoals}
      goalInteractions={goalInteractions}
      currentCheckup={currentCheckup}
      partnershipId={partnershipId || ""}
      checkupReviewData={{
        hasDebt,
        hasInvestments,
        hasSuperProfile,
        // Step 1
        monthlyEssentialsCents,
        monthlyDiscretionaryCents,
        monthlyTotalSpendCents,
        topCategories,
        // Step 2
        liquidBalanceCents,
        emergencyFundMonths,
        savingsRatePercent: Math.max(0, savingsRate),
        activeGoalsCount: activeGoals.length,
        goalsTotalSavedCents,
        goalsTotalTargetCents,
        // Step 3
        totalInvestmentCents,
        investmentAllocation,
        rebalanceDeltas: rebalanceDeltas.map((d) => ({
          assetType: d.assetType,
          currentPercent: d.currentPercent,
          targetPercent: d.targetPercent,
          deltaPercent: d.deltaPercent,
        })),
        hasTargetAllocations: allTargets.length > 0,
        // Step 4
        homeLoanBalanceCents,
        homeLoanAccountCount,
        // Step 5
        superBalanceCents: profile?.super_balance_cents || 0,
        sgRate,
        annualIncomeCents,
        superCapRoomCents: superCapRoom.remainingCents,
        currentAge,
        targetRetirementAge: profile?.target_retirement_age || null,
        // Step 7
        priorityRecommendationsSummary,
      }}
    />
  );
}
