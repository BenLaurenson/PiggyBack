import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { InvestClient } from "@/components/invest/invest-client";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import {
  aggregatePortfolioHistory,
  calculatePerformanceMetrics,
  calculateTopMovers,
  calculateRebalancing,
  getStartDateForPeriod,
} from "@/lib/portfolio-aggregation";
import { calculateFireNumber, calculateAnnualExpenses } from "@/lib/fire-calculations";
import { computeNextDueDate } from "@/lib/recurring-investments";

interface InvestPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function InvestPage({ searchParams }: InvestPageProps) {
  const params = await searchParams;
  const period = (typeof params.period === "string" ? params.period : "3M") as string;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const partnershipId = await getUserPartnershipId(supabase, user.id);

  // Fetch all investments
  const { data: investments } = await supabase
    .from("investments")
    .select("*")
    .eq("partnership_id", partnershipId)
    .order("created_at", { ascending: false });

  if (!investments || investments.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <EmptyState
          icon="📈"
          title="Start tracking your investments"
          description="Add your stocks, ETFs, crypto, and other investments to see your full portfolio."
          action={{ label: "Add Investment", href: "/invest/add", color: "purple" }}
        />
      </div>
    );
  }

  const investmentIds = investments.map((i) => i.id);
  const now = new Date();
  const startDate = getStartDateForPeriod(period, now);

  // Fetch user's accounts for scoping transaction queries
  const { data: userAccounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true);
  const accountIds = userAccounts?.map((a) => a.id) || [];

  // Parallel data fetching
  const [
    { data: allHistory },
    { data: targetAllocations },
    { data: budgetAssignments },
    { data: profile },
    { data: watchlistItems },
    { data: dividendTransactions },
    { data: recurringRules },
    { data: contributions },
    { data: descriptionSuggestions },
  ] = await Promise.all([
    // Investment history (for portfolio chart + forward-fill)
    supabase
      .from("investment_history")
      .select("investment_id, value_cents, recorded_at")
      .in("investment_id", investmentIds)
      .order("recorded_at", { ascending: true }),
    // Target allocations
    supabase
      .from("target_allocations")
      .select("asset_type, target_percentage")
      .eq("partnership_id", partnershipId),
    // Budget contributions to investments this month
    supabase
      .from("budget_assignments")
      .select("asset_id, assigned_cents")
      .eq("partnership_id", partnershipId)
      .eq("assignment_type", "asset")
      .eq("month", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`),
    // FIRE profile data
    supabase
      .from("profiles")
      .select("fire_onboarded, fire_variant, super_balance_cents, date_of_birth, target_retirement_age, expected_return_rate, annual_expense_override_cents")
      .eq("id", user.id)
      .maybeSingle(),
    // Watchlist items
    supabase
      .from("watchlist_items")
      .select("*")
      .eq("partnership_id", partnershipId)
      .order("created_at", { ascending: false }),
    // Investment income transactions (last 12 months) — scoped to user's accounts
    accountIds.length > 0
      ? supabase
          .from("transactions")
          .select("amount_cents, created_at")
          .in("account_id", accountIds)
          .eq("income_type", "investment")
          .gte("created_at", new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString())
      : Promise.resolve({ data: [] }),
    // Recurring investment rules (Phase-1 #46)
    supabase
      .from("recurring_investments")
      .select("id, asset_id, amount_cents, frequency, anchor_date, merchant_pattern, is_active, created_at, updated_at")
      .eq("partnership_id", partnershipId)
      .order("created_at", { ascending: true }),
    // Contributions detected by the webhook (last 12 months — caps the size of the
    // "last 6 contributions" list and the contribution-vs-growth chart).
    supabase
      .from("investment_contributions")
      .select("id, investment_id, rule_id, amount_cents, contributed_at, source_transaction_id")
      .eq("partnership_id", partnershipId)
      .gte("contributed_at", new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString())
      .order("contributed_at", { ascending: false }),
    // Distinct merchant descriptions to suggest in the "Add rule" dialog. We
    // surface the top ~50 negative-amount descriptions on the user's accounts
    // so they can quickly pick "PEARLER" / "VANGUARD" / etc.
    accountIds.length > 0
      ? supabase
          .from("transactions")
          .select("description")
          .in("account_id", accountIds)
          .lt("amount_cents", 0)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
  ]);

  // === Calculations ===

  // Totals
  const totalValue = investments.reduce((sum, inv) => sum + (inv.current_value_cents || 0), 0);
  const totalPurchaseValue = investments.reduce((sum, inv) => sum + (inv.purchase_value_cents || 0), 0);
  const totalGain = totalValue - totalPurchaseValue;
  const totalGainPercentage = totalPurchaseValue > 0 ? (totalGain / totalPurchaseValue) * 100 : 0;

  // Group by asset type
  type Investment = (typeof investments)[number];
  const investmentsByType: Record<string, Investment[]> = {};
  for (const inv of investments) {
    if (!investmentsByType[inv.asset_type]) investmentsByType[inv.asset_type] = [];
    investmentsByType[inv.asset_type].push(inv);
  }

  // Allocation
  const allocation = Object.entries(investmentsByType).map(([type, items]) => ({
    type,
    value: items.reduce((sum, inv) => sum + (inv.current_value_cents || 0), 0),
    count: items.length,
  }));

  // Portfolio history chart data
  const portfolioHistory = aggregatePortfolioHistory(
    investments.map((i) => ({
      id: i.id,
      current_value_cents: i.current_value_cents,
      purchase_value_cents: i.purchase_value_cents,
      created_at: i.created_at,
    })),
    allHistory || [],
    startDate,
    now
  );

  // Performance metrics
  const performanceMetrics = calculatePerformanceMetrics(
    investments.map((i) => ({
      id: i.id,
      name: i.name,
      current_value_cents: i.current_value_cents,
      purchase_value_cents: i.purchase_value_cents,
      created_at: i.created_at,
    }))
  );

  // Top movers
  const topMovers = calculateTopMovers(
    investments.map((i) => ({
      id: i.id,
      name: i.name,
      ticker_symbol: i.ticker_symbol,
      asset_type: i.asset_type,
      current_value_cents: i.current_value_cents,
      purchase_value_cents: i.purchase_value_cents,
      created_at: i.created_at,
    }))
  );

  // Rebalancing
  const rebalanceDeltas = calculateRebalancing(
    allocation.map((a) => ({ assetType: a.type, valueCents: a.value })),
    targetAllocations || [],
    totalValue
  );

  // FIRE progress
  let fireProgress = null;
  if (profile?.fire_onboarded && profile?.super_balance_cents != null) {
    const superBalance = profile.super_balance_cents || 0;
    const currentTotal = totalValue + superBalance;
    // Simplified: use override or estimate annual expenses at $60k
    const annualExpenses = profile.annual_expense_override_cents || 6000000; // $60k default
    const fireNumber = calculateFireNumber(annualExpenses);
    const progressPercent = fireNumber > 0 ? Math.min(100, (currentTotal / fireNumber) * 100) : 0;

    fireProgress = {
      progressPercent,
      fireNumberCents: fireNumber,
      currentTotalCents: currentTotal,
      fireVariant: profile.fire_variant || "regular",
    };
  }

  // Budget contributions
  const budgetContributions = (budgetAssignments || [])
    .map((a: any) => {
      const inv = investments.find((i) => i.id === a.asset_id);
      return {
        investmentName: inv?.name || "Unknown",
        assignedCents: a.assigned_cents || 0,
      };
    })
    .filter((c: any) => c.assignedCents > 0);
  const totalBudgetContribution = budgetContributions.reduce((s: number, c: any) => s + c.assignedCents, 0);
  const currentMonth = now.toLocaleDateString("en-AU", { month: "short", year: "numeric" });

  // Dividend income by month (last 12 months)
  const monthlyDividends: { month: string; amountCents: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toLocaleDateString("en-AU", { month: "short" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

    const monthTotal = (dividendTransactions || [])
      .filter((t: any) => {
        const txDate = new Date(t.created_at);
        return txDate >= monthStart && txDate <= monthEnd;
      })
      .reduce((s: number, t: any) => s + Math.abs(t.amount_cents || 0), 0);

    monthlyDividends.push({ month: monthStr, amountCents: monthTotal });
  }
  const annualDividendTotal = monthlyDividends.reduce((s, d) => s + d.amountCents, 0);
  const monthlyDividendAvg = monthlyDividends.length > 0 ? Math.round(annualDividendTotal / monthlyDividends.length) : 0;

  // === Recurring investment rules ===
  // Map each rule to its asset name + last 6 contributions (for the
  // dashboard card and per-rule breakdown chart). Rules without any
  // contributions yet show "no detections yet" in the UI.
  const contributionsByRule: Record<string, Array<{ id: string; amountCents: number; contributedAt: string }>> = {};
  for (const c of (contributions || [])) {
    if (!c.rule_id) continue;
    if (!contributionsByRule[c.rule_id]) contributionsByRule[c.rule_id] = [];
    contributionsByRule[c.rule_id].push({
      id: c.id,
      amountCents: c.amount_cents,
      contributedAt: c.contributed_at,
    });
  }

  type Rule = NonNullable<typeof recurringRules>[number];
  const recurringInvestmentRules = (recurringRules || []).map((r: Rule) => {
    const inv = investments.find((i) => i.id === r.asset_id);
    const ruleContribs = (contributionsByRule[r.id] || []).slice(0, 6);
    const contributedTotal = (contributionsByRule[r.id] || []).reduce(
      (s, c) => s + c.amountCents,
      0
    );
    const currentValue = inv?.current_value_cents || 0;
    return {
      id: r.id,
      asset_id: r.asset_id,
      asset_name: inv?.name || "(deleted asset)",
      asset_ticker: inv?.ticker_symbol || null,
      amount_cents: r.amount_cents,
      frequency: r.frequency as
        | "weekly"
        | "fortnightly"
        | "monthly"
        | "quarterly"
        | "yearly",
      anchor_date: r.anchor_date,
      merchant_pattern: r.merchant_pattern,
      is_active: r.is_active,
      next_due_date: computeNextDueDate(r.anchor_date, r.frequency, now),
      recent_contributions: ruleContribs,
      contributed_total_cents: contributedTotal,
      current_value_cents: currentValue,
    };
  });

  // Distinct merchant suggestions for the "Add rule" dialog autocomplete.
  // De-duplicate but keep insertion order so the most recent appear first.
  const merchantSuggestions = Array.from(
    new Set(
      ((descriptionSuggestions as { description: string }[] | null) || [])
        .map((t) => (t.description || "").trim())
        .filter((d) => d.length >= 2)
    )
  ).slice(0, 50);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <InvestClient
        investments={investments}
        investmentsByType={investmentsByType}
        allocation={allocation}
        totalValue={totalValue}
        totalGain={totalGain}
        totalGainPercentage={totalGainPercentage}
        portfolioHistory={portfolioHistory}
        currentPeriod={period}
        performanceMetrics={performanceMetrics}
        topMovers={topMovers}
        rebalanceDeltas={rebalanceDeltas}
        hasTargetAllocations={(targetAllocations || []).length > 0}
        fireProgress={fireProgress}
        budgetContributions={budgetContributions}
        totalBudgetContribution={totalBudgetContribution}
        currentMonth={currentMonth}
        watchlistItems={(watchlistItems || []).map((w: any) => ({
          id: w.id,
          name: w.name,
          ticker_symbol: w.ticker_symbol,
          asset_type: w.asset_type,
          last_price_cents: w.last_price_cents,
          last_price_updated_at: w.last_price_updated_at,
        }))}
        monthlyDividends={monthlyDividends}
        annualDividendTotal={annualDividendTotal}
        monthlyDividendAvg={monthlyDividendAvg}
        recurringInvestmentRules={recurringInvestmentRules}
        merchantSuggestions={merchantSuggestions}
      />
    </div>
  );
}
