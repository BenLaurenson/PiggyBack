import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { generalReadLimiter } from "@/lib/rate-limiter";
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

/**
 * GET /api/budget/summary?budget_id=xxx&date=2026-02-15
 *
 * Returns a full BudgetSummary for a specific budget and period.
 * Replaces the 21+ parallel queries previously done in page.tsx with
 * a single API call that fetches data and runs the budget engine.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateCheck = generalReadLimiter.check(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
      );
    }

    // ── Parse & validate query params ──────────────────────────────────
    const { searchParams } = new URL(request.url);
    const budgetId = searchParams.get("budget_id");
    const dateParam = searchParams.get("date");

    if (!budgetId || !dateParam) {
      return NextResponse.json(
        { error: "Missing required params: budget_id, date" },
        { status: 400 }
      );
    }

    const date = new Date(dateParam);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "Invalid date parameter" },
        { status: 400 }
      );
    }

    // ── Load the budget record ─────────────────────────────────────────
    const { data: budget, error: budgetError } = await supabase
      .from("user_budgets")
      .select("*")
      .eq("id", budgetId)
      .single();

    if (budgetError || !budget) {
      return NextResponse.json(
        { error: "Budget not found" },
        { status: 404 }
      );
    }

    // ── Verify user belongs to the partnership ─────────────────────────
    const partnershipId = await getUserPartnershipId(supabase, user.id);
    if (!partnershipId || partnershipId !== budget.partnership_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Compute period range and month key ─────────────────────────────
    const periodRange = getBudgetPeriodRange(date, budget.period_type);
    const monthKey = getMonthKeyForPeriod(date);

    // ── Get effective account IDs (handles JOINT dedup) ────────────────
    const accountIds = await getEffectiveAccountIds(
      supabase,
      partnershipId,
      user.id,
      budget.budget_view
    );

    // ── 10 parallel data fetches ────────────────────────────────────────
    // All queries run concurrently via Promise.all. Each provides one
    // slice of the BudgetSummaryInput that the engine needs to produce
    // a complete budget summary (income, assignments, spending, etc.).
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
      // 1. Income sources — all active income for the partnership (any frequency).
      //    The engine normalizes each source to the budget's period type to compute
      //    total expected income regardless of whether income is weekly/fortnightly/monthly.
      supabase
        .from("income_sources")
        .select(
          "amount_cents, frequency, source_type, is_received, received_date, user_id, is_manual_partner_income"
        )
        .eq("partnership_id", partnershipId)
        .eq("is_active", true)
        .limit(100),

      // 2. Budget assignments — manual amounts the user has allocated for this
      //    budget + month + view. These are the "assigned" column in the budget table,
      //    keyed by category/subcategory or by goal_id/asset_id.
      supabase
        .from("budget_assignments")
        .select(
          "category_name, subcategory_name, assigned_cents, assignment_type, goal_id, asset_id"
        )
        .eq("budget_id", budgetId)
        .eq("month", monthKey)
        .eq("budget_view", budget.budget_view)
        .limit(500),

      // 3. Transactions — actual expenses in this period for the user's effective
      //    accounts. Only negative amounts (spending) and non-transfers are included.
      //    Embeds expense_matches to link transactions back to expense definitions.
      accountIds.length > 0
        ? supabase
            .from("transactions")
            .select("id, amount_cents, category_id, settled_at, expense_matches(expense_definition_id)")
            .in("account_id", accountIds)
            .gte("settled_at", periodRange.start.toISOString())
            .lte("settled_at", periodRange.end.toISOString())
            .lt("amount_cents", 0)
            .eq("is_internal_transfer", false)
            .neq("status", "DELETED")
            .limit(5000)
        : Promise.resolve({ data: [], error: null }),

      // 4. Expense definitions — recurring/expected expenses with nested
      //    expense_matches->transactions for category inference. The nested join
      //    lets us infer which budget subcategory an expense belongs to (see the
      //    "most-common-category" heuristic below).
      supabase
        .from("expense_definitions")
        .select(
          "id, name, expected_amount_cents, recurrence_type, next_due_date, expense_matches(transactions(category_id))"
        )
        .eq("partnership_id", partnershipId)
        .eq("is_active", true)
        .limit(200),

      // 5. Split settings — couple split configuration (50/50, percentage-based, etc.)
      //    Used in INDIVIDUAL budget views to adjust amounts by each partner's share.
      supabase
        .from("couple_split_settings")
        .select("category_name, expense_definition_id, split_type, owner_percentage")
        .eq("partnership_id", partnershipId)
        .limit(100),

      // 6. Category mappings — translates UP Bank category_id values into display
      //    parent/child names and icons. Global table (no partnership filter).
      //    Also used for the icon lookup in the post-processing annotation loop.
      supabase
        .from("category_mappings")
        .select("up_category_id, new_parent_name, new_child_name, icon, display_order")
        .limit(200),

      // 7. Carryover — leftover funds from the previous period, stored in
      //    budget_months. Feeds the "To Be Budgeted" calculation as an additive term.
      supabase
        .from("budget_months")
        .select("carryover_from_previous_cents")
        .eq("budget_id", budgetId)
        .eq("month", monthKey)
        .maybeSingle(),

      // 8. Layout preset — active drag-and-drop layout config for methodology
      //    budgets (e.g. 50/30/20 sections). Determines which subcategories appear
      //    in which section and which are hidden.
      supabase
        .from("budget_layout_presets")
        .select("layout_config")
        .eq("budget_id", budgetId)
        .eq("is_active", true)
        .maybeSingle(),

      // 9. Goals — savings goals for the partnership. Used to create goal
      //    assignment rows and to annotate them with names/icons/targets.
      //    linked_account_id is used to look up internal transfers as contributions.
      supabase
        .from("savings_goals")
        .select("id, name, icon, target_amount_cents, current_amount_cents, linked_account_id")
        .eq("partnership_id", partnershipId)
        .limit(100),

      // 10. Investments — asset holdings for the partnership. Used to create
      //     asset assignment rows and annotate them with names/types/values.
      supabase
        .from("investments")
        .select("id, name, asset_type, current_value_cents")
        .eq("partnership_id", partnershipId)
        .limit(100),
    ]);

    // ── Check for critical query errors ────────────────────────────────
    // If any core data query fails, return an error instead of silently
    // producing an all-zero budget summary with missing data.
    const queryErrors: string[] = [];
    if (incomeResult.error) {
      console.error("Income query error:", incomeResult.error);
      queryErrors.push("income_sources");
    }
    if (assignmentResult.error) {
      console.error("Assignment query error:", assignmentResult.error);
      queryErrors.push("budget_assignments");
    }
    if (transactionResult.error) {
      console.error("Transaction query error:", transactionResult.error);
      queryErrors.push("transactions");
    }
    if (expenseDefResult.error) {
      console.error("Expense def query error:", expenseDefResult.error);
      queryErrors.push("expense_definitions");
    }
    if (splitResult.error) {
      console.error("Split settings query error:", splitResult.error);
      queryErrors.push("couple_split_settings");
    }
    if (categoryMapResult.error) {
      console.error("Category map query error:", categoryMapResult.error);
      queryErrors.push("category_mappings");
    }
    if (goalsResult.error) {
      console.error("Goals query error:", goalsResult.error);
      queryErrors.push("savings_goals");
    }
    if (investmentsResult.error) {
      console.error("Investments query error:", investmentsResult.error);
      queryErrors.push("investments");
    }
    if (queryErrors.length > 0) {
      return NextResponse.json(
        { error: `Failed to fetch budget data: ${queryErrors.join(", ")}` },
        { status: 500 }
      );
    }

    // ── Fetch goal & investment contributions for this period ──────────
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
          .neq("status", "DELETED")
          .gte("settled_at", periodRange.start.toISOString())
          .lte("settled_at", periodRange.end.toISOString())
          .limit(1000)
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
        .lte("contributed_at", periodRange.end.toISOString())
        .limit(1000);
      for (const c of contribs ?? []) {
        assetContributions.set(c.investment_id,
          (assetContributions.get(c.investment_id) ?? 0) + c.amount_cents);
      }
    }

    // ── Map data to engine input types ─────────────────────────────────

    const incomeSources: IncomeSourceInput[] = (incomeResult.data ?? []).map(
      (s) => ({
        amount_cents: s.amount_cents,
        frequency: s.frequency,
        source_type: s.source_type,
        is_received: s.is_received,
        received_date: s.received_date,
        user_id: s.user_id,
        is_manual_partner_income: s.is_manual_partner_income,
      })
    );

    const assignments: AssignmentInput[] = (assignmentResult.data ?? []).map(
      (a) => ({
        category_name: a.category_name,
        subcategory_name: a.subcategory_name,
        assigned_cents: a.assigned_cents,
        assignment_type: a.assignment_type,
        goal_id: a.goal_id,
        asset_id: a.asset_id,
      })
    );

    const categoryMappings: CategoryMapping[] = (
      categoryMapResult.data ?? []
    ).map((m) => ({
      up_category_id: m.up_category_id,
      new_parent_name: m.new_parent_name,
      new_child_name: m.new_child_name,
    }));

    // Build a category lookup for inferring expense subcategories
    const catLookup = new Map<string, { parent: string; child: string }>();
    for (const m of categoryMappings) {
      catLookup.set(m.up_category_id, {
        parent: m.new_parent_name,
        child: m.new_child_name,
      });
    }

    const transactions: TransactionInput[] = (transactionResult.data ?? []).map(
      (t) => {
        // PostgREST relation gotcha: `expense_matches` on a transaction.
        // Because the FK from expense_matches to transactions has a unique constraint,
        // PostgREST returns a single OBJECT (not an array) when there's a match.
        // We must handle both shapes — array (if the constraint is ever relaxed or
        // PostgREST returns [] for no matches) and object (the normal 1-to-1 case).
        const raw = t.expense_matches as any;
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
      }
    );

    /**
     * Expense subcategory inference
     *
     * Expense definitions don't store a direct category — instead, the category
     * is inferred from the transactions they've been matched to over time.
     *
     * Algorithm:
     *  1. Walk all expense_matches for this expense definition
     *  2. Each match links to one transaction; grab that transaction's category_id
     *  3. Count occurrences of each category_id across all matched transactions
     *  4. Pick the most common category_id ("most-common-category" heuristic)
     *  5. Look up parent/child display names from the category_mappings table
     *
     * If an expense matches transactions across multiple categories (e.g. a
     * subscription that banks categorize inconsistently), the dominant one wins.
     */
    const expenseDefinitions: ExpenseDefInput[] = (
      expenseDefResult.data ?? []
    ).map((exp) => {
      let categoryName = "";
      let inferredSubcategory: string | null = null;

      // PostgREST relation gotcha: `transactions` inside each expense_match.
      // Each expense_match has exactly one transaction (many-to-one FK), so
      // PostgREST returns an object, not an array. The type below reflects this.
      const matches = exp.expense_matches as unknown as
        | { transactions: { category_id: string | null } | null }[]
        | null;

      if (matches && matches.length > 0) {
        const catCounts = new Map<string, number>();
        for (const match of matches) {
          const catId = match.transactions?.category_id;
          if (catId) {
            catCounts.set(catId, (catCounts.get(catId) ?? 0) + 1);
          }
        }

        // Find the most common category_id
        let maxCount = 0;
        let bestCatId: string | null = null;
        for (const [catId, count] of catCounts) {
          if (count > maxCount) {
            maxCount = count;
            bestCatId = catId;
          }
        }

        // Look up the parent/child names
        if (bestCatId) {
          const mapping = catLookup.get(bestCatId);
          if (mapping) {
            categoryName = mapping.parent;
            inferredSubcategory = mapping.child;
          }
        }
      }

      return {
        id: exp.id,
        category_name: categoryName,
        expected_amount_cents: exp.expected_amount_cents,
        recurrence_type: exp.recurrence_type,
        inferred_subcategory: inferredSubcategory,
        next_due_date: exp.next_due_date ?? null,
      };
    });

    const splitSettings: SplitSettingInput[] = (splitResult.data ?? []).map(
      (s) => ({
        category_name: s.category_name,
        expense_definition_id: s.expense_definition_id,
        split_type: s.split_type,
        owner_percentage: s.owner_percentage != null ? Number(s.owner_percentage) : undefined,
      })
    );

    // Carryover: read from budget_months, default to 0
    const carryoverFromPrevious =
      carryoverResult.data?.carryover_from_previous_cents ?? 0;

    // Layout sections (for methodology budgets like 50/30/20)
    // DB stores {title, targetPercentage, items: [{id}]} — normalize to engine format
    const rawLayoutConfig = layoutResult.data?.layout_config as Record<string, any> | null;
    const layoutSections = (rawLayoutConfig?.sections as any[] | undefined)?.map((s: any) => ({
      name: s.name ?? s.title ?? "",
      percentage: s.percentage ?? s.targetPercentage ?? 0,
      itemIds: s.itemIds ?? (s.items as any[] | undefined)?.map((i: any) => i.id ?? i) ?? [],
    }));
    const layoutConfig = rawLayoutConfig ? {
      sections: layoutSections,
      hiddenItemIds: rawLayoutConfig.hiddenItemIds as string[] | undefined,
    } : null;

    /**
     * Layout subcategory key extraction
     *
     * The layout config stores drag-and-drop IDs like "subcategory-Parent::Child".
     * We strip the "subcategory-" prefix to get the engine's row key format
     * ("Parent::Child"). Both visible section itemIds AND hiddenItemIds are
     * included — the engine needs to create rows for ALL layout subcategories,
     * even ones with no assignments or transactions this period, so the UI
     * can display them in their correct drag positions.
     */
    const layoutSubcategoryKeys: string[] = [];
    const allLayoutItemIds = [
      ...(layoutSections ?? []).flatMap((s) => s.itemIds),
      ...(layoutConfig?.hiddenItemIds ?? []),
    ];
    for (const itemId of allLayoutItemIds) {
      if (itemId.startsWith("subcategory-") && itemId.includes("::")) {
        // "subcategory-Parent::Child" -> "Parent::Child"
        layoutSubcategoryKeys.push(itemId.slice("subcategory-".length));
      }
    }

    // ── Map goals and assets for engine ────────────────────────────────
    const goals: GoalInput[] = (goalsResult.data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ?? "🎯",
      target: g.target_amount_cents ?? 0,
      currentAmount: g.current_amount_cents ?? 0,
    }));

    const assets: AssetInput[] = (investmentsResult.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      assetType: a.asset_type ?? "other",
      currentValue: a.current_value_cents ?? 0,
    }));

    // ── Build engine input and calculate ───────────────────────────────

    const input: BudgetSummaryInput = {
      periodType: budget.period_type,
      budgetView: budget.budget_view,
      carryoverMode: "none",
      methodology: budget.methodology,
      totalBudget: budget.total_budget,
      userId: user.id,
      ownerUserId: budget.created_by ?? user.id,
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
      layoutSubcategoryKeys,
    };

    const summary = calculateBudgetSummary(input);

    // Build name lookups for goals and assets
    const goalNameMap = new Map<string, { name: string; icon: string; target: number; current: number }>();
    for (const g of goalsResult.data ?? []) {
      goalNameMap.set(g.id, { name: g.name, icon: g.icon ?? "🎯", target: g.target_amount_cents ?? 0, current: g.current_amount_cents ?? 0 });
    }
    const assetNameMap = new Map<string, { name: string; type: string; value: number }>();
    for (const a of investmentsResult.data ?? []) {
      assetNameMap.set(a.id, { name: a.name, type: a.asset_type ?? "other", value: a.current_value_cents ?? 0 });
    }

    // Build icon lookup from category mappings (child name → icon)
    const iconByChild = new Map<string, string>();
    const iconByParent = new Map<string, string>();
    for (const m of categoryMapResult.data ?? []) {
      iconByChild.set(m.new_child_name, (m as any).icon ?? "💸");
      if (!iconByParent.has(m.new_parent_name)) {
        iconByParent.set(m.new_parent_name, (m as any).icon ?? "💸");
      }
    }

    /**
     * Post-processing annotation loop
     *
     * Engine rows have IDs and calculated amounts (budgeted/spent/available)
     * but lack display metadata — the engine is pure math with no DB access.
     * This loop enriches each row with:
     *  - Goal rows: real name, icon, target amount, current saved amount
     *  - Asset rows: real name, asset type, current market value
     *  - Subcategory rows: icon (from category_mappings child name -> icon)
     *    and parent icon for grouped display
     */
    for (const row of summary.rows) {
      if (row.type === "goal") {
        const goalId = row.id.replace("goal::", "");
        const goal = goalNameMap.get(goalId);
        if (goal) {
          row.name = goal.name;
          (row as any).icon = goal.icon;
          (row as any).target = goal.target;
          (row as any).currentAmount = goal.current;
        }
      } else if (row.type === "asset") {
        const assetId = row.id.replace("asset::", "");
        const asset = assetNameMap.get(assetId);
        if (asset) {
          row.name = asset.name;
          (row as any).assetType = asset.type;
          (row as any).currentValue = asset.value;
        }
      } else if (row.type === "subcategory") {
        (row as any).icon = iconByChild.get(row.name) ?? "💸";
        if (row.parentCategory) {
          (row as any).parentIcon = iconByParent.get(row.parentCategory) ?? "💸";
        }
      }
    }

    return NextResponse.json({
      ...summary,
      periodLabel: periodRange.label,
      periodStart: periodRange.start.toISOString(),
      periodEnd: periodRange.end.toISOString(),
      monthKey,
    });
  } catch (err) {
    console.error("Budget summary error:", err);
    return NextResponse.json(
      { error: "Failed to calculate budget summary" },
      { status: 500 }
    );
  }
}
