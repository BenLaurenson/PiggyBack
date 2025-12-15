import { createClient } from "@/utils/supabase/server";
import { BudgetProvider } from "@/contexts/budget-context";
import type { BudgetSummaryResponse } from "@/contexts/budget-context";
import { CategoryProvider } from "@/contexts/category-context";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";
import { getCurrentDate } from "@/lib/demo-guard";
import { EmptyState } from "@/components/ui/empty-state";
import { BudgetEmptyState } from "@/components/budget/budget-empty-state";
import { BudgetListView } from "@/components/budget/budget-list-view";
import { BudgetPageShell } from "@/components/budget/budget-page-shell";
import { getBudgets } from "@/app/actions/budgets";
import {
  getBudgetPeriodRange,
  calculateBudgetSummary,
  getMonthKeyForPeriod,
  type BudgetSummaryInput,
  type IncomeSourceInput,
  type AssignmentInput,
  type TransactionInput,
  type ExpenseDefInput,
  type SplitSettingInput,
  type CategoryMapping,
  type GoalInput,
  type AssetInput,
} from "@/lib/budget-engine";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; period?: string; tab?: string; id?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Please log in</div>;
  }

  const partnershipId = await getUserPartnershipId(supabase, user.id);

  if (!partnershipId) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon="💰"
          title="Set up your budget"
          description="Connect your bank account to start tracking your spending and managing your budget."
          action={{ label: "Get Started", href: "/settings/up-connection", color: "mint" }}
        />
      </div>
    );
  }

  const params = await searchParams;

  // ── Multi-budget routing ──────────────────────────────────────────────
  const { data: userBudgets } = await getBudgets(partnershipId);

  const { count: legacyAssignmentCount } = await supabase
    .from("budget_assignments")
    .select("*", { count: "exact", head: true })
    .eq("partnership_id", partnershipId)
    .is("budget_id", null);

  const hasExistingData = (legacyAssignmentCount ?? 0) > 0;

  // No budgets → empty state
  if (!userBudgets || userBudgets.length === 0) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
        <BudgetEmptyState hasExistingData={hasExistingData} />
      </div>
    );
  }

  // No budget selected → list view
  if (!params.id) {
    const accountIds = await getEffectiveAccountIds(supabase, partnershipId, user.id, "shared");
    const now = getCurrentDate();
    const currentMonth = getMonthKeyForPeriod(now);
    const monthRange = getBudgetPeriodRange(new Date(currentMonth), "monthly");

    // Fetch shared data for all budgets + per-budget assignments
    const [
      { data: allAssignments },
      { data: listTransactions },
      { data: listViewExpenses },
      { data: listCategoryMappings },
      { data: listIncomeSources },
      { data: listSplitSettings },
    ] = await Promise.all([
      supabase
        .from("budget_assignments")
        .select("budget_id, category_name, subcategory_name, assigned_cents, assignment_type, goal_id, asset_id")
        .eq("partnership_id", partnershipId)
        .eq("month", currentMonth),
      supabase
        .from("transactions")
        .select("id, amount_cents, category_id, settled_at")
        .in("account_id", accountIds)
        .lt("amount_cents", 0)
        .eq("is_internal_transfer", false)
        .gte("settled_at", monthRange.start.toISOString())
        .lte("settled_at", monthRange.end.toISOString()),
      supabase
        .from("expense_definitions")
        .select("id, name, emoji, category_name, expected_amount_cents, next_due_date, recurrence_type, expense_matches!left(*, transactions(amount_cents, settled_at, created_at, category_id))")
        .eq("partnership_id", partnershipId)
        .eq("is_active", true)
        .order("next_due_date"),
      supabase
        .from("category_mappings")
        .select("up_category_id, new_parent_name, new_child_name")
        .order("display_order"),
      supabase
        .from("income_sources")
        .select("amount_cents, frequency, source_type, is_received, received_date, user_id, is_manual_partner_income")
        .eq("partnership_id", partnershipId),
      supabase
        .from("couple_split_settings")
        .select("category_name, expense_definition_id, split_type, owner_percentage")
        .eq("partnership_id", partnershipId),
    ]);

    // Build shared engine inputs once
    const catMappings: CategoryMapping[] = (listCategoryMappings || []).map(m => ({
      up_category_id: m.up_category_id,
      new_parent_name: m.new_parent_name,
      new_child_name: m.new_child_name,
    }));
    const catLookup = new Map<string, { parent: string; child: string }>();
    for (const m of catMappings) catLookup.set(m.up_category_id, { parent: m.new_parent_name, child: m.new_child_name });

    const sharedTransactions: TransactionInput[] = (listTransactions || []).map(t => ({
      id: t.id,
      amount_cents: t.amount_cents,
      category_id: t.category_id,
      created_at: t.settled_at,
      split_override_percentage: null,
      matched_expense_id: null,
    }));

    const sharedExpenseDefs: ExpenseDefInput[] = (listViewExpenses || []).map(exp => {
      let categoryName = "";
      let inferredSubcategory: string | null = null;
      const matches = exp.expense_matches as any[] | null;
      if (matches && matches.length > 0) {
        const catCounts = new Map<string, number>();
        for (const match of matches) {
          const txns = match.transactions;
          if (!txns) continue;
          const txnArray = Array.isArray(txns) ? txns : [txns];
          for (const txn of txnArray) {
            if (txn.category_id) catCounts.set(txn.category_id, (catCounts.get(txn.category_id) ?? 0) + 1);
          }
        }
        let maxCount = 0; let bestCatId: string | null = null;
        for (const [catId, count] of catCounts) { if (count > maxCount) { maxCount = count; bestCatId = catId; } }
        if (bestCatId) {
          const mapping = catLookup.get(bestCatId);
          if (mapping) { categoryName = mapping.parent; inferredSubcategory = mapping.child; }
        }
      }
      return {
        id: exp.id,
        category_name: categoryName,
        expected_amount_cents: exp.expected_amount_cents,
        recurrence_type: exp.recurrence_type,
        inferred_subcategory: inferredSubcategory,
      };
    });

    const sharedIncome: IncomeSourceInput[] = (listIncomeSources || []).map(s => ({
      amount_cents: s.amount_cents, frequency: s.frequency, source_type: s.source_type,
      is_received: s.is_received, received_date: s.received_date, user_id: s.user_id,
      is_manual_partner_income: s.is_manual_partner_income,
    }));

    const sharedSplits: SplitSettingInput[] = (listSplitSettings || []).map(s => ({
      category_name: s.category_name, expense_definition_id: s.expense_definition_id,
      split_type: s.split_type, owner_percentage: s.owner_percentage != null ? Number(s.owner_percentage) : undefined,
    }));

    // Run engine per budget to get accurate stats
    const budgetStats: Record<string, { totalAssigned: number; totalSpent: number; categoryCount: number }> = {};
    for (const budget of userBudgets) {
      const periodRange = getBudgetPeriodRange(now, budget.period_type);
      const ba = (allAssignments || []).filter(a => a.budget_id === budget.id);
      const assignments: AssignmentInput[] = ba.map(a => ({
        category_name: a.category_name, subcategory_name: a.subcategory_name,
        assigned_cents: a.assigned_cents, assignment_type: a.assignment_type,
        goal_id: a.goal_id, asset_id: a.asset_id,
      }));

      const summary = calculateBudgetSummary({
        periodType: budget.period_type,
        budgetView: budget.budget_view,
        carryoverMode: "none",
        methodology: budget.methodology,
        totalBudget: budget.total_budget,
        userId: user.id,
        ownerUserId: budget.created_by ?? user.id,
        periodRange,
        incomeSources: sharedIncome,
        assignments,
        transactions: sharedTransactions,
        expenseDefinitions: sharedExpenseDefs,
        splitSettings: sharedSplits,
        categoryMappings: catMappings,
        carryoverFromPrevious: 0,
      });

      const totalBudgeted = summary.rows.reduce((s, r) => s + r.budgeted, 0);
      const totalSpent = summary.rows.reduce((s, r) => s + r.spent, 0);
      const categoryCount = new Set(summary.rows.filter(r => r.budgeted > 0).map(r => r.name)).size;
      budgetStats[budget.id] = { totalAssigned: totalBudgeted, totalSpent: totalSpent, categoryCount };
    }

    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
        <BudgetListView
          budgets={userBudgets}
          partnershipId={partnershipId}
          budgetStats={budgetStats}
          currentMonth={currentMonth}
          expenses={(listViewExpenses || []).map(exp => {
            const split = (listSplitSettings || []).find(s => s.expense_definition_id === exp.id);
            if (split && split.owner_percentage != null && split.owner_percentage !== 100) {
              return { ...exp, original_amount_cents: exp.expected_amount_cents, split_percentage: split.owner_percentage, expected_amount_cents: Math.round(exp.expected_amount_cents * split.owner_percentage / 100) };
            }
            return exp;
          })}
          categories={[...new Set((listCategoryMappings || []).map(m => m.new_child_name))]}
        />
      </div>
    );
  }

  // Find selected budget by id or slug
  const selectedBudget = userBudgets.find(b => b.id === params.id || b.slug === params.id);
  if (!selectedBudget) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
        <BudgetListView budgets={userBudgets} partnershipId={partnershipId} />
      </div>
    );
  }

  // ── Engine-based data loading (same approach as /api/budget/summary) ──
  const now = getCurrentDate();
  const periodRange = getBudgetPeriodRange(now, selectedBudget.period_type);
  const monthKey = getMonthKeyForPeriod(now);

  const accountIds = await getEffectiveAccountIds(
    supabase, partnershipId, user.id, selectedBudget.budget_view
  );

  const [
    incomeResult,
    assignmentResult,
    transactionResult,
    expenseDefResult,
    splitResult,
    categoryMapResult,
    carryoverResult,
    layoutResult,
    goalsResult,
    investmentsResult,
  ] = await Promise.all([
    supabase
      .from("income_sources")
      .select("amount_cents, frequency, source_type, is_received, received_date, user_id, is_manual_partner_income")
      .eq("partnership_id", partnershipId)
      .eq("is_active", true),
    supabase
      .from("budget_assignments")
      .select("category_name, subcategory_name, assigned_cents, assignment_type, goal_id, asset_id")
      .eq("budget_id", selectedBudget.id)
      .eq("month", monthKey)
      .eq("budget_view", selectedBudget.budget_view),
    accountIds.length > 0
      ? supabase
          .from("transactions")
          .select("id, amount_cents, category_id, settled_at, expense_matches(expense_definition_id)")
          .in("account_id", accountIds)
          .gte("settled_at", periodRange.start.toISOString())
          .lte("settled_at", periodRange.end.toISOString())
          .lt("amount_cents", 0)
          .eq("is_internal_transfer", false)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("expense_definitions")
      .select("id, name, emoji, category_name, expected_amount_cents, next_due_date, recurrence_type, expense_matches!left(*, transactions(amount_cents, settled_at, created_at, category_id))")
      .eq("partnership_id", partnershipId)
      .eq("is_active", true)
      .order("next_due_date"),
    supabase
      .from("couple_split_settings")
      .select("category_name, expense_definition_id, split_type, owner_percentage")
      .eq("partnership_id", partnershipId),
    supabase
      .from("category_mappings")
      .select("up_category_id, new_parent_name, new_child_name, icon, display_order"),
    supabase
      .from("budget_months")
      .select("carryover_from_previous_cents")
      .eq("budget_id", selectedBudget.id)
      .eq("month", monthKey)
      .maybeSingle(),
    supabase
      .from("budget_layout_presets")
      .select("layout_config")
      .eq("budget_id", selectedBudget.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("savings_goals")
      .select("id, name, icon, target_amount_cents, current_amount_cents, linked_account_id")
      .eq("partnership_id", partnershipId),
    supabase
      .from("investments")
      .select("id, name, asset_type, current_value_cents")
      .eq("partnership_id", partnershipId),
  ]);

  // ── Map to engine input types ─────────────────────────────────────────
  const incomeSources: IncomeSourceInput[] = (incomeResult.data ?? []).map(s => ({
    amount_cents: s.amount_cents,
    frequency: s.frequency,
    source_type: s.source_type,
    is_received: s.is_received,
    received_date: s.received_date,
    user_id: s.user_id,
    is_manual_partner_income: s.is_manual_partner_income,
  }));

  const assignments: AssignmentInput[] = (assignmentResult.data ?? []).map(a => ({
    category_name: a.category_name,
    subcategory_name: a.subcategory_name,
    assigned_cents: a.assigned_cents,
    assignment_type: a.assignment_type,
    goal_id: a.goal_id,
    asset_id: a.asset_id,
  }));

  const categoryMappings: CategoryMapping[] = (categoryMapResult.data ?? []).map(m => ({
    up_category_id: m.up_category_id,
    new_parent_name: m.new_parent_name,
    new_child_name: m.new_child_name,
  }));

  const catLookup = new Map<string, { parent: string; child: string }>();
  for (const m of categoryMappings) {
    catLookup.set(m.up_category_id, { parent: m.new_parent_name, child: m.new_child_name });
  }

  const transactions: TransactionInput[] = (transactionResult.data ?? []).map(t => {
    // IMPORTANT: PostgREST returns embedded relations as a single OBJECT when the FK
    // has a unique constraint (1-to-1), NOT an array. Do NOT use .length to check —
    // objects don't have .length. Always handle both object and array formats.
    const raw = (t as any).expense_matches;
    const matchedExpenseId = raw
      ? (Array.isArray(raw) ? raw[0]?.expense_definition_id : raw.expense_definition_id) ?? null
      : null;
    return {
      id: t.id,
      amount_cents: t.amount_cents,
      category_id: t.category_id,
      created_at: t.settled_at,
      split_override_percentage: null,
      matched_expense_id: matchedExpenseId,
    };
  });

  const expenseDefinitions: ExpenseDefInput[] = (expenseDefResult.data ?? []).map(exp => {
    let categoryName = "";
    let inferredSubcategory: string | null = null;
    const matches = exp.expense_matches as unknown as { transactions: { category_id: string | null } | { category_id: string | null }[] | null }[] | null;
    if (matches && matches.length > 0) {
      const catCounts = new Map<string, number>();
      for (const match of matches) {
        const txns = match.transactions;
        if (!txns) continue;
        const txnArray = Array.isArray(txns) ? txns : [txns];
        for (const txn of txnArray) {
          if (txn.category_id) {
            catCounts.set(txn.category_id, (catCounts.get(txn.category_id) ?? 0) + 1);
          }
        }
      }
      let maxCount = 0;
      let bestCatId: string | null = null;
      for (const [catId, count] of catCounts) {
        if (count > maxCount) { maxCount = count; bestCatId = catId; }
      }
      if (bestCatId) {
        const mapping = catLookup.get(bestCatId);
        if (mapping) { categoryName = mapping.parent; inferredSubcategory = mapping.child; }
      }
    }
    return {
      id: exp.id,
      category_name: categoryName,
      expected_amount_cents: exp.expected_amount_cents,
      recurrence_type: exp.recurrence_type,
      inferred_subcategory: inferredSubcategory,
    };
  });

  const splitSettings: SplitSettingInput[] = (splitResult.data ?? []).map(s => ({
    category_name: s.category_name,
    expense_definition_id: s.expense_definition_id,
    split_type: s.split_type,
    owner_percentage: s.owner_percentage != null ? Number(s.owner_percentage) : undefined,
  }));

  const carryoverFromPrevious = carryoverResult.data?.carryover_from_previous_cents ?? 0;

  const layoutConfig = layoutResult.data?.layout_config as Record<string, any> | null;
  // Normalize DB section format for the engine (UI uses layoutConfig directly)
  const layoutSections = (layoutConfig?.sections as any[] | undefined)?.map((s: any) => ({
    name: s.name ?? s.title ?? "",
    percentage: s.percentage ?? s.targetPercentage ?? 0,
    itemIds: s.itemIds ?? (s.items as any[] | undefined)?.map((i: any) => i.id ?? i) ?? [],
  }));

  // ── Fetch goal & investment contributions for this period ────────────
  // Goal contributions: internal transfers to goal-linked saver accounts
  const goalLinkedAccountIds = (goalsResult.data ?? [])
    .map((g) => g.linked_account_id)
    .filter(Boolean) as string[];

  const goalTransfersResult = goalLinkedAccountIds.length > 0
    ? await supabase
        .from("transactions")
        .select("transfer_account_id, amount_cents")
        .eq("is_internal_transfer", true)
        .in("transfer_account_id", goalLinkedAccountIds)
        .gte("settled_at", periodRange.start.toISOString())
        .lte("settled_at", periodRange.end.toISOString())
    : { data: [], error: null };

  const goalContributions = new Map<string, number>();
  const accountToGoal = new Map<string, string>();
  for (const g of goalsResult.data ?? []) {
    if (g.linked_account_id) accountToGoal.set(g.linked_account_id, g.id);
  }
  for (const t of goalTransfersResult.data ?? []) {
    const goalId = accountToGoal.get(t.transfer_account_id);
    if (goalId) {
      goalContributions.set(goalId,
        (goalContributions.get(goalId) ?? 0) + Math.abs(t.amount_cents));
    }
  }

  // Investment contributions: from investment_contributions table
  const assetContributions = new Map<string, number>();
  const investmentIds = (investmentsResult.data ?? []).map((i) => i.id);
  if (investmentIds.length > 0) {
    const { data: contribs } = await supabase
      .from("investment_contributions")
      .select("investment_id, amount_cents")
      .in("investment_id", investmentIds)
      .gte("contributed_at", periodRange.start.toISOString())
      .lte("contributed_at", periodRange.end.toISOString());
    for (const c of contribs ?? []) {
      assetContributions.set(c.investment_id,
        (assetContributions.get(c.investment_id) ?? 0) + c.amount_cents);
    }
  }

  // Map goals and assets for engine
  const goals: GoalInput[] = (goalsResult.data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon ?? "🎯",
    target: g.target_amount_cents ?? 0,
    currentAmount: g.current_amount_cents ?? 0,
    linked_account_id: g.linked_account_id ?? undefined,
  }));

  const assets: AssetInput[] = (investmentsResult.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    assetType: a.asset_type ?? "other",
    currentValue: a.current_value_cents ?? 0,
  }));

  // ── Calculate budget summary ──────────────────────────────────────────
  const engineInput: BudgetSummaryInput = {
    periodType: selectedBudget.period_type,
    budgetView: selectedBudget.budget_view,
    carryoverMode: "none",
    methodology: selectedBudget.methodology,
    totalBudget: selectedBudget.total_budget,
    userId: user.id,
    ownerUserId: selectedBudget.created_by ?? user.id,
    periodRange,
    incomeSources,
    assignments,
    transactions,
    expenseDefinitions,
    splitSettings,
    categoryMappings,
    carryoverFromPrevious,
    layoutSections,
    goals,
    assets,
    goalContributions,
    assetContributions,
  };

  const summary = calculateBudgetSummary(engineInput);

  // Annotate engine rows with real names and icons
  const goalNameMap = new Map<string, { name: string; icon: string; target: number; current: number }>();
  for (const g of goalsResult.data ?? []) {
    goalNameMap.set(g.id, { name: g.name, icon: g.icon ?? "🎯", target: g.target_amount_cents ?? 0, current: g.current_amount_cents ?? 0 });
  }
  const assetNameMap = new Map<string, { name: string; type: string; value: number }>();
  for (const a of investmentsResult.data ?? []) {
    assetNameMap.set(a.id, { name: a.name, type: a.asset_type ?? "other", value: a.current_value_cents ?? 0 });
  }
  const iconByChild = new Map<string, string>();
  const iconByParent = new Map<string, string>();
  for (const m of categoryMapResult.data ?? []) {
    iconByChild.set(m.new_child_name, m.icon ?? "💸");
    if (!iconByParent.has(m.new_parent_name)) {
      iconByParent.set(m.new_parent_name, m.icon ?? "💸");
    }
  }
  for (const row of summary.rows) {
    if (row.type === "goal") {
      const goal = goalNameMap.get(row.id.replace("goal::", ""));
      if (goal) { row.name = goal.name; (row as any).icon = goal.icon; (row as any).target = goal.target; (row as any).currentAmount = goal.current; }
    } else if (row.type === "asset") {
      const asset = assetNameMap.get(row.id.replace("asset::", ""));
      if (asset) { row.name = asset.name; (row as any).assetType = asset.type; (row as any).currentValue = asset.value; }
    } else if (row.type === "subcategory") {
      (row as any).icon = iconByChild.get(row.name) ?? "💸";
      if (row.parentCategory) { (row as any).parentIcon = iconByParent.get(row.parentCategory) ?? "💸"; }
    }
  }

  const initialSummary: BudgetSummaryResponse = {
    ...summary,
    periodLabel: periodRange.label,
    periodStart: periodRange.start.toISOString(),
    periodEnd: periodRange.end.toISOString(),
    monthKey,
  };

  // ── Build category mappings for CategoryProvider ───────────────────────
  const categoryMappingsForProvider = (categoryMapResult.data ?? []).map(m => ({
    upCategoryId: m.up_category_id,
    newParentName: m.new_parent_name,
    newChildName: m.new_child_name,
    icon: m.icon ?? "💸",
    displayOrder: m.display_order ?? 0,
  }));

  // Build expense → inferred subcategory lookup so UI can filter per-subcategory
  const expSubcategoryMap = new Map<string, { subcategory: string; parentCategory: string }>();
  for (const exp of expenseDefinitions) {
    if (exp.inferred_subcategory) {
      expSubcategoryMap.set(exp.id, {
        subcategory: exp.inferred_subcategory,
        parentCategory: exp.category_name,
      });
    }
  }

  // Minimal budgetData for BudgetPageShell
  const budgetData = {
    categories: [] as any[],
    chartDataByChart: {},
    expenses: (expenseDefResult.data || []).map((e: any) => {
      const inferred = expSubcategoryMap.get(e.id);
      return {
        ...e,
        inferred_subcategory: inferred?.subcategory ?? null,
        inferred_parent_category: inferred?.parentCategory ?? null,
      };
    }),
    goals: [] as any[],
    assets: [] as any[],
    partnershipId,
    accountIds,
    initialVisibility: {},
    methodology: selectedBudget.methodology,
    totalIncome: summary.income,
    allTransactions: [] as any[],
    incomeTransactions: [] as any[],
    categoryMappings: categoryMappingsForProvider,
    incomeSources: [] as any[],
    partnerIncomeSources: [] as any[],
    initialUserId: user.id,
    initialLayoutConfig: layoutConfig,
    nextPayDate: null,
    initialCategoryShares: [] as any[],
    initialSplitSettings: splitSettings.map(s => ({
      expense_definition_id: s.expense_definition_id,
      category_name: s.category_name,
      split_type: s.split_type,
      owner_percentage: s.owner_percentage,
    })),
  };

  return (
    <CategoryProvider mappings={categoryMappingsForProvider}>
      <BudgetProvider
        budget={selectedBudget}
        initialSummary={initialSummary}
        initialDate={now}
      >
        <BudgetPageShell
          budget={selectedBudget}
          budgetData={budgetData}
          initialTab={params.tab}
        />
      </BudgetProvider>
    </CategoryProvider>
  );
}
