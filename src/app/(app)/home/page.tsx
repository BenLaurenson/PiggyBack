import { createClient } from "@/utils/supabase/server";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { EmptyState } from "@/components/ui/empty-state";
import { getDisplayName } from "@/lib/user-display";
import { getCurrentDate } from "@/lib/demo-guard";
import { generateInsights } from "@/lib/spending-insights";
import { advanceStaleIncomeSources } from "@/lib/advance-pay-date";
import { getUserPartnershipId } from "@/lib/get-user-partnership";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6">Please log in</div>;
  }

  // Batch 1: Independent queries in parallel
  const [
    { data: profile },
    partnershipId,
    { data: accounts },
    { data: categoryMappings },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    getUserPartnershipId(supabase, user.id),
    supabase.from("accounts").select("id, balance_cents, display_name, account_type, updated_at").eq("user_id", user.id).eq("is_active", true),
    supabase.from("category_mappings").select("up_category_id, new_parent_name, icon"),
  ]);

  if (!accounts || accounts.length === 0) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary mb-6">
          Welcome, {getDisplayName(profile?.display_name, user.user_metadata?.full_name, user.email)}!
        </h1>
        <EmptyState
          icon="🏦"
          title="Connect your bank to get started"
          description="Link your UP Bank account to see your balances, transactions, and spending insights."
          action={{ label: "Connect Bank", href: "/settings/up-connection", color: "mint" }}
        />
      </div>
    );
  }

  const accountIds = accounts.map(a => a.id);

  // Calculate total balance
  const totalBalance = accounts?.reduce((sum, acc) => sum + (acc.balance_cents || 0), 0) || 0;

  // Get last sync time
  const lastSyncTime = accounts?.reduce((latest, acc) => {
    const accDate = acc.updated_at ? new Date(acc.updated_at) : null;
    if (!accDate) return latest;
    if (!latest) return accDate;
    return accDate > latest ? accDate : latest;
  }, null as Date | null);

  // Current month dates
  const now = getCurrentDate();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Batch 2: Queries that depend on accountIds/partnershipId — run in parallel
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    { data: monthTransactions },
    { data: recentTransactions },
    { data: upcomingExpenses },
    { data: goals },
    { data: netWorthSnapshots },
    { data: incomeSourcesRaw },
    { data: historicalTransactions },
    { data: insightTransactions },
    { data: fullCategoryMappings },
    { data: expenseDefinitions },
    { data: splitSettings },
  ] = await Promise.all([
    supabase.from("transactions").select("amount_cents, category_id, is_income, created_at").in("account_id", accountIds).is("transfer_account_id", null).gte("created_at", startOfMonth.toISOString()).lte("created_at", endOfMonth.toISOString()),
    supabase.from("transactions").select("id, description, amount_cents, created_at, category_id, is_income").in("account_id", accountIds).is("transfer_account_id", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("expense_definitions").select("id, name, emoji, expected_amount_cents, next_due_date, recurrence_type, expense_matches!left(id, for_period, matched_at, transaction_id, transactions(amount_cents, settled_at, created_at))").eq("partnership_id", partnershipId).eq("is_active", true).order("next_due_date"),
    supabase.from("savings_goals").select("id, name, icon, color, current_amount_cents, target_amount_cents, deadline").eq("partnership_id", partnershipId).eq("is_completed", false).order("created_at", { ascending: false }).limit(3),
    supabase.from("net_worth_snapshots").select("snapshot_date, total_balance_cents, investment_total_cents").eq("partnership_id", partnershipId).order("snapshot_date", { ascending: true }).limit(12),
    supabase.from("income_sources").select("id, next_pay_date, amount_cents, frequency").eq("user_id", user.id).eq("is_active", true).eq("source_type", "recurring-salary").eq("is_manual_partner_income", false),
    supabase.from("transactions").select("amount_cents, is_income, created_at").in("account_id", accountIds).is("transfer_account_id", null).gte("created_at", sixMonthsAgo.toISOString()).lte("created_at", endOfMonth.toISOString()),
    supabase.from("transactions").select("description, amount_cents, created_at, category_id, parent_category_id, is_internal_transfer").in("account_id", accountIds).is("transfer_account_id", null).gte("created_at", sixMonthsAgo.toISOString()).lte("created_at", endOfMonth.toISOString()),
    supabase.from("category_mappings").select("up_category_id, new_parent_name, new_child_name"),
    supabase.from("expense_definitions").select("id, name, match_pattern, merchant_name, category_name, expected_amount_cents, recurrence_type").eq("partnership_id", partnershipId).eq("is_active", true),
    supabase.from("couple_split_settings").select("expense_definition_id, owner_percentage").eq("partnership_id", partnershipId),
  ]);

  // Calculate spending and income
  const monthlySpending = Math.abs(
    monthTransactions?.filter(t => t.amount_cents < 0 && !t.is_income)
      .reduce((sum, t) => sum + t.amount_cents, 0) || 0
  );

  const monthlyIncome = monthTransactions
    ?.filter(t => t.amount_cents > 0 || t.is_income)
    .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0) || 0;

  // Top spending by category this month
  const categorySpending = monthTransactions
    ?.filter(t => t.amount_cents < 0 && !t.is_income)
    .reduce((acc, t) => {
      if (t.category_id) {
        acc[t.category_id] = (acc[t.category_id] || 0) + Math.abs(t.amount_cents);
      }
      return acc;
    }, {} as Record<string, number>) || {};

  const topCategories = Object.entries(categorySpending)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([categoryId, amount]) => {
      const mapping = categoryMappings?.find(m => m.up_category_id === categoryId);
      return {
        categoryId,
        amount,
        name: mapping?.new_parent_name || categoryId,
        icon: mapping?.icon || "💳",
      };
    });

  // Process bills - check if paid by transaction date in current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const processedBills = upcomingExpenses?.map(e => {
    const isPaid = e.expense_matches?.some((m: any) => {
      const txn = m.transactions;
      if (txn) {
        // Supabase nested join returns single object for 1:1 relation
        const settledAt = txn.settled_at || txn.created_at;
        if (settledAt) {
          const txnDate = new Date(settledAt);
          return txnDate >= monthStart && txnDate <= monthEnd;
        }
      }
      if (m.matched_at) {
        const matchDate = new Date(m.matched_at);
        return matchDate >= monthStart && matchDate <= monthEnd;
      }
      return false;
    }) || false;

    return {
      id: e.id,
      name: e.name,
      emoji: e.emoji,
      amount: (() => {
        const split = (splitSettings || []).find((s: any) => s.expense_definition_id === e.id);
        if (split && split.owner_percentage != null && split.owner_percentage !== 100) {
          return Math.round(e.expected_amount_cents * split.owner_percentage / 100);
        }
        return e.expected_amount_cents;
      })(),
      dueDate: e.next_due_date,
      isPaid,
    };
  }) || [];

  // Generate real daily spending data from this month's transactions
  const dailySpendingMap: Record<number, number> = {};
  const today = now.getDate();
  for (let d = 1; d <= today; d++) {
    dailySpendingMap[d] = 0;
  }
  monthTransactions
    ?.filter(t => t.amount_cents < 0 && !t.is_income)
    .forEach(t => {
      const day = new Date(t.created_at).getDate();
      if (day >= 1 && day <= today) {
        dailySpendingMap[day] = (dailySpendingMap[day] || 0) + Math.abs(t.amount_cents);
      }
    });

  const dailySpending = Object.entries(dailySpendingMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, amount]) => ({
      day: Number(day),
      amount: Math.round(amount / 100),
      label: `Day ${day}`,
    }));

  // Group by month
  const monthlyFlowMap: Record<string, { income: number; spending: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyFlowMap[key] = { income: 0, spending: 0 };
  }

  historicalTransactions?.forEach(t => {
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyFlowMap[key]) {
      if (t.amount_cents > 0 || t.is_income) {
        monthlyFlowMap[key].income += Math.abs(t.amount_cents);
      } else if (t.amount_cents < 0 && !t.is_income) {
        monthlyFlowMap[key].spending += Math.abs(t.amount_cents);
      }
    }
  });

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyNetFlow = Object.entries(monthlyFlowMap).map(([key, data]) => {
    const [year, month] = key.split("-");
    return {
      month: monthNames[parseInt(month) - 1],
      income: data.income,
      spending: data.spending,
      net: data.income - data.spending,
    };
  });

  const insights = generateInsights(
    insightTransactions || [],
    fullCategoryMappings || [],
    expenseDefinitions || []
  );

  // Auto-advance any stale income source dates
  const incomeSources = advanceStaleIncomeSources(supabase, incomeSourcesRaw || []);

  const nextPayDateStr = incomeSources
    .map(s => s.next_pay_date)
    .filter(Boolean)
    .sort()
    .find(d => new Date(d!) >= now) || null;

  const nextPayDate = nextPayDateStr ? new Date(nextPayDateStr) : null;
  const daysUntilPay = nextPayDate && nextPayDate > now
    ? Math.ceil((nextPayDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Financial Pulse calculations
  const avgMonthlyIncome = monthlyNetFlow.reduce((s, m) => s + m.income, 0) / Math.max(monthlyNetFlow.length, 1);
  const avgMonthlySpending = monthlyNetFlow.reduce((s, m) => s + m.spending, 0) / Math.max(monthlyNetFlow.length, 1);
  const monthlySavingsRate = avgMonthlyIncome - avgMonthlySpending;
  const monthlyBurnRate = avgMonthlySpending;

  // Safe to spend: balance minus unpaid bills before next payday, with 10% buffer
  const safeToSpend = daysUntilPay !== null && nextPayDate
    ? (() => {
        const unpaidBillsBeforePayday = processedBills
          .filter(b => !b.isPaid && new Date(b.dueDate) <= nextPayDate)
          .reduce((sum, b) => sum + b.amount, 0);
        return Math.max(0, (totalBalance - unpaidBillsBeforePayday) * 0.9);
      })()
    : null;

  // Year-end projection
  const monthsRemaining = 12 - now.getMonth();
  const yearEndProjection = totalBalance + (monthlySavingsRate * monthsRemaining);

  // Health score (0-100)
  let healthScore = 0;
  if (monthlySpending <= monthlyIncome) healthScore += 25; // Not overspending
  if (monthlySavingsRate > 0) healthScore += 25; // Positive savings
  const paidBillCount = (upcomingExpenses || []).filter(e =>
    e.expense_matches?.some((m: any) => m.transactions)
  ).length;
  const totalBillCount = (upcomingExpenses || []).length;
  healthScore += totalBillCount > 0 ? Math.round((paidBillCount / totalBillCount) * 25) : 25;
  if (monthlyIncome > 0 && monthlySpending / monthlyIncome < 0.9) healthScore += 25; // Under 90% spend ratio
  healthScore = Math.min(100, Math.max(0, healthScore));

  return (
    <>
      <DashboardClient
        userName={getDisplayName(profile?.display_name, user.user_metadata?.full_name, user.email)}
        totalBalance={totalBalance}
        accountCount={accounts?.length || 0}
        lastSyncTime={lastSyncTime?.toISOString() || null}
        monthlySpending={monthlySpending}
        monthlyIncome={monthlyIncome}
        recentTransactions={recentTransactions || []}
        categoryMappings={categoryMappings || []}
        topCategories={topCategories}
        upcomingBills={processedBills}
        recurringExpenses={(upcomingExpenses || []).map(exp => {
          const split = (splitSettings || []).find((s: any) => s.expense_definition_id === exp.id);
          if (split && split.owner_percentage != null && split.owner_percentage !== 100) {
            return { ...exp, original_amount_cents: exp.expected_amount_cents, split_percentage: split.owner_percentage, expected_amount_cents: Math.round(exp.expected_amount_cents * split.owner_percentage / 100) };
          }
          return exp;
        })}
        goals={goals || []}
        daysUntilPay={daysUntilPay}
        nextPayAmount={incomeSources?.[0]?.amount_cents || null}
        dailySpending={dailySpending}
        monthlyNetFlow={monthlyNetFlow}
        insights={insights}
        netWorthSnapshots={netWorthSnapshots || []}
        healthScore={healthScore}
        safeToSpend={safeToSpend}
        monthlyBurnRate={monthlyBurnRate}
        yearEndProjection={yearEndProjection}
      />
    </>
  );
}
