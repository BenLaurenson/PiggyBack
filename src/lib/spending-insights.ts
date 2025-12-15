/**
 * Spending Insights Engine
 *
 * Generates smart, actionable insights from transaction data.
 * All computations are server-side on pre-fetched data.
 */


export interface Insight {
  id: string;
  type:
    | "spending_anomaly"
    | "merchant_frequency"
    | "day_of_week"
    | "subscription_duplicate"
    | "category_trend"
    | "savings_opportunity";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  value?: number; // Amount in cents for sorting/display
}

interface TransactionRow {
  description: string;
  amount_cents: number;
  created_at: string;
  category_id: string | null;
  parent_category_id: string | null;
  is_internal_transfer?: boolean;
}

interface CategoryMapping {
  up_category_id: string;
  new_parent_name: string;
  new_child_name: string;
}

interface ExpenseDefinition {
  id: string;
  name: string;
  match_pattern: string | null;
  merchant_name: string | null;
  category_name?: string | null;
  expected_amount_cents?: number | null;
  recurrence_type?: string | null;
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(cents) / 100);
}

function buildCategoryMap(mappings: CategoryMapping[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of mappings) {
    map.set(m.up_category_id, m.new_parent_name);
  }
  return map;
}

function getCategoryName(
  categoryId: string | null,
  parentCategoryId: string | null,
  categoryMap: Map<string, string>
): string {
  const catId = categoryId || parentCategoryId;
  if (!catId) return "Uncategorized";
  return categoryMap.get(catId) || "Uncategorized";
}

/**
 * Generate all insights from transaction data.
 */
export function generateInsights(
  transactions: TransactionRow[],
  categoryMappings: CategoryMapping[],
  expenseDefinitions: ExpenseDefinition[]
): Insight[] {
  const insights: Insight[] = [];

  // Filter to spending only (exclude income, transfers)
  const spending = transactions.filter(
    (t) => t.amount_cents < 0 && !t.is_internal_transfer
  );

  if (spending.length === 0) return insights;

  // Build category lookup map once — O(mappings) — instead of O(mappings) per transaction
  const categoryMap = buildCategoryMap(categoryMappings);

  // 1. Spending anomalies (current month vs 3-month average)
  insights.push(...detectSpendingAnomalies(spending, categoryMap));

  // 2. Merchant frequency alerts
  insights.push(...detectMerchantFrequency(spending));

  // 3. Day-of-week patterns
  insights.push(...detectDayOfWeekPatterns(spending));

  // 4. Subscription duplicates
  insights.push(
    ...detectSubscriptionDuplicateInsights(
      spending,
      expenseDefinitions,
      categoryMappings
    )
  );

  // 5. Category trends (quarter over quarter)
  insights.push(...detectCategoryTrends(spending, categoryMap));

  // 6. Savings opportunities
  insights.push(...detectSavingsOpportunities(spending));

  // Sort: critical first, then warning, then info. Within severity, by value desc.
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return insights.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.value || 0) - (a.value || 0);
  });
}

function detectSpendingAnomalies(
  spending: TransactionRow[],
  categoryMap: Map<string, string>
): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Group spending by category and month
  const catMonthly = new Map<string, Map<string, number>>();

  for (const txn of spending) {
    const date = new Date(txn.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const catName = getCategoryName(
      txn.category_id,
      txn.parent_category_id,
      categoryMap
    );

    if (!catMonthly.has(catName)) catMonthly.set(catName, new Map());
    const months = catMonthly.get(catName)!;
    months.set(monthKey, (months.get(monthKey) || 0) + Math.abs(txn.amount_cents));
  }

  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  for (const [catName, months] of catMonthly) {
    if (catName === "Uncategorized") continue;

    const currentSpend = months.get(currentMonthKey) || 0;
    if (currentSpend === 0) continue;

    // Calculate 3-month average (excluding current month)
    const priorMonths: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const val = months.get(key);
      if (val !== undefined) priorMonths.push(val);
    }

    if (priorMonths.length < 2) continue;

    const avg =
      priorMonths.reduce((s, v) => s + v, 0) / priorMonths.length;
    if (avg === 0) continue;

    const pctChange = ((currentSpend - avg) / avg) * 100;

    if (pctChange > 100) {
      insights.push({
        id: `anomaly-${catName}`,
        type: "spending_anomaly",
        severity: "critical",
        title: `${catName} spending doubled`,
        description: `You've spent ${formatDollars(currentSpend)} on ${catName} this month, ${Math.round(pctChange)}% more than your ${formatDollars(avg)} average.`,
        actionLabel: "View category",
        actionHref: `/budget`,
        value: currentSpend,
      });
    } else if (pctChange > 40) {
      insights.push({
        id: `anomaly-${catName}`,
        type: "spending_anomaly",
        severity: "warning",
        title: `${catName} spending up ${Math.round(pctChange)}%`,
        description: `${formatDollars(currentSpend)} spent vs ${formatDollars(avg)} monthly average.`,
        actionLabel: "View category",
        actionHref: `/budget`,
        value: currentSpend,
      });
    }
  }

  return insights;
}

function detectMerchantFrequency(spending: TransactionRow[]): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();

  // Look at last 3 months
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const recent = spending.filter(
    (t) => new Date(t.created_at) >= threeMonthsAgo
  );

  // Count by merchant
  const merchantCounts = new Map<
    string,
    { count: number; totalCents: number }
  >();
  for (const txn of recent) {
    const existing = merchantCounts.get(txn.description) || {
      count: 0,
      totalCents: 0,
    };
    existing.count++;
    existing.totalCents += Math.abs(txn.amount_cents);
    merchantCounts.set(txn.description, existing);
  }

  for (const [merchant, data] of merchantCounts) {
    if (data.count >= 50) {
      const perMonth = Math.round(data.count / 3);
      insights.push({
        id: `freq-${merchant}`,
        type: "merchant_frequency",
        severity: "warning",
        title: `${merchant}: ${data.count} transactions in 3 months`,
        description: `That's ~${perMonth}/month, totaling ${formatDollars(data.totalCents)}. Consider if all these purchases are necessary.`,
        actionLabel: "View merchant",
        actionHref: `/activity/merchant/${encodeURIComponent(merchant)}`,
        value: data.totalCents,
      });
    } else if (data.count >= 30) {
      insights.push({
        id: `freq-${merchant}`,
        type: "merchant_frequency",
        severity: "info",
        title: `Frequent spender: ${merchant}`,
        description: `${data.count} visits in 3 months totaling ${formatDollars(data.totalCents)}.`,
        actionLabel: "View merchant",
        actionHref: `/activity/merchant/${encodeURIComponent(merchant)}`,
        value: data.totalCents,
      });
    }
  }

  return insights;
}

function detectDayOfWeekPatterns(spending: TransactionRow[]): Insight[] {
  const insights: Insight[] = [];
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // Last 3 months only
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const recent = spending.filter(
    (t) => new Date(t.created_at) >= threeMonthsAgo
  );

  const dayTotals = new Array(7).fill(0);
  const dayCounts = new Array(7).fill(0);

  for (const txn of recent) {
    const day = new Date(txn.created_at).getDay();
    dayTotals[day] += Math.abs(txn.amount_cents);
    dayCounts[day]++;
  }

  const dayAverages = dayTotals.map((total, i) =>
    dayCounts[i] > 0 ? total / dayCounts[i] : 0
  );

  const maxDay = dayAverages.indexOf(Math.max(...dayAverages));
  const minDay = dayAverages.indexOf(
    Math.min(...dayAverages.filter((a) => a > 0))
  );

  if (dayAverages[minDay] > 0) {
    const ratio = dayAverages[maxDay] / dayAverages[minDay];
    if (ratio >= 3) {
      insights.push({
        id: "day-of-week",
        type: "day_of_week",
        severity: "info",
        title: `${dayNames[maxDay]}s are your biggest spending day`,
        description: `You spend ${ratio.toFixed(1)}x more on ${dayNames[maxDay]}s (avg ${formatDollars(dayAverages[maxDay])}/txn) compared to ${dayNames[minDay]}s (${formatDollars(dayAverages[minDay])}/txn).`,
        value: dayAverages[maxDay],
      });
    }
  }

  return insights;
}

function getMonthlyEquivalentCents(
  amountCents: number,
  recurrenceType: string
): number {
  switch (recurrenceType) {
    case "weekly":
      return Math.round(amountCents * 4.33);
    case "fortnightly":
      return Math.round(amountCents * 2.17);
    case "monthly":
      return amountCents;
    case "quarterly":
      return Math.round(amountCents / 3);
    case "yearly":
      return Math.round(amountCents / 12);
    default:
      return amountCents;
  }
}

function detectSubscriptionDuplicateInsights(
  _spending: TransactionRow[],
  expenseDefinitions: ExpenseDefinition[],
  _categoryMappings: CategoryMapping[]
): Insight[] {
  const insights: Insight[] = [];

  // Group active expense definitions by category
  const byCat = new Map<string, ExpenseDefinition[]>();
  for (const ed of expenseDefinitions) {
    const cat = ed.category_name || "Uncategorized";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(ed);
  }

  for (const [catName, expenses] of byCat) {
    if (expenses.length >= 2) {
      const names = expenses.map((e) => e.name).join(", ");
      const totalMonthlyCents = expenses.reduce(
        (sum, e) =>
          sum +
          getMonthlyEquivalentCents(
            e.expected_amount_cents || 0,
            e.recurrence_type || "monthly"
          ),
        0
      );
      insights.push({
        id: `dup-${catName}`,
        type: "subscription_duplicate",
        severity: expenses.length >= 3 ? "warning" : "info",
        title: `${expenses.length} subscriptions in ${catName}`,
        description: `${names} — totaling ${formatDollars(totalMonthlyCents)}/month. Could you consolidate?`,
        actionLabel: "View expenses",
        actionHref: "/budget?tab=expenses",
        value: totalMonthlyCents,
      });
    }
  }

  return insights;
}

function detectCategoryTrends(
  spending: TransactionRow[],
  categoryMap: Map<string, string>
): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();

  // Compare last 3 months vs prior 3 months
  const recent3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const prior3Start = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const recentSpend = new Map<string, number>();
  const priorSpend = new Map<string, number>();

  for (const txn of spending) {
    const date = new Date(txn.created_at);
    const catName = getCategoryName(
      txn.category_id,
      txn.parent_category_id,
      categoryMap
    );
    if (catName === "Uncategorized") continue;

    const amt = Math.abs(txn.amount_cents);
    if (date >= recent3Start) {
      recentSpend.set(catName, (recentSpend.get(catName) || 0) + amt);
    } else if (date >= prior3Start && date < recent3Start) {
      priorSpend.set(catName, (priorSpend.get(catName) || 0) + amt);
    }
  }

  for (const [cat, recentTotal] of recentSpend) {
    const priorTotal = priorSpend.get(cat);
    if (!priorTotal || priorTotal < 10000) continue; // Skip tiny categories

    const pctChange = ((recentTotal - priorTotal) / priorTotal) * 100;

    if (pctChange > 50) {
      insights.push({
        id: `trend-${cat}`,
        type: "category_trend",
        severity: "info",
        title: `${cat} trending up`,
        description: `Up ${Math.round(pctChange)}% over the last quarter: ${formatDollars(recentTotal / 3)}/month vs ${formatDollars(priorTotal / 3)} previously.`,
        actionLabel: "View budget",
        actionHref: "/budget",
        value: recentTotal - priorTotal,
      });
    } else if (pctChange < -30) {
      insights.push({
        id: `trend-${cat}-down`,
        type: "category_trend",
        severity: "info",
        title: `${cat} trending down`,
        description: `Down ${Math.round(Math.abs(pctChange))}% — ${formatDollars(recentTotal / 3)}/month vs ${formatDollars(priorTotal / 3)} previously. Nice work!`,
        value: 0,
      });
    }
  }

  return insights;
}

function detectSavingsOpportunities(spending: TransactionRow[]): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  // Find top discretionary merchants (excluding known necessities)
  const necessities = new Set([
    "deft real estate",
    "belong",
    "department of transport wa",
    "rac",
  ]);

  const merchantTotals = new Map<string, number>();
  const recentSpending = spending.filter(
    (t) => new Date(t.created_at) >= sixMonthsAgo
  );

  for (const txn of recentSpending) {
    if (necessities.has(txn.description.toLowerCase())) continue;
    const current = merchantTotals.get(txn.description) || 0;
    merchantTotals.set(txn.description, current + Math.abs(txn.amount_cents));
  }

  // Find merchants where a 50% reduction would save >$500/year
  const sorted = Array.from(merchantTotals.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  for (const [merchant, sixMonthTotal] of sorted.slice(0, 3)) {
    const annualEstimate = sixMonthTotal * 2;
    const annualSavings = Math.round(annualEstimate * 0.5);

    if (annualSavings >= 50000) {
      // $500+/year
      insights.push({
        id: `savings-${merchant}`,
        type: "savings_opportunity",
        severity: "info",
        title: `Save ${formatDollars(annualSavings)}/year at ${merchant}`,
        description: `You're spending ~${formatDollars(Math.round(annualEstimate / 12))}/month here. Cutting by half saves ${formatDollars(annualSavings)} annually.`,
        actionLabel: "View merchant",
        actionHref: `/activity/merchant/${encodeURIComponent(merchant)}`,
        value: annualSavings,
      });
    }
  }

  return insights;
}
