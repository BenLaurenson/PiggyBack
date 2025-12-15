"use client";

/**
 * Budget Page Shell — two-component architecture:
 *
 * `BudgetPageShell` (outer) wraps children in `BudgetSharingProvider` so that
 * couple-split state (expense splits, category shares) is available to descendants.
 *
 * `BudgetPageShellContent` (inner) consumes three contexts — `useBudget`,
 * `useBudgetSharing`, and `useBudgetLayoutSettings` — then maps engine data
 * into UI rows and renders the Overview / Settings tab layout.
 *
 * This split is necessary because a React component cannot both *provide* and
 * *consume* the same context; the provider must sit above the consumer in the tree.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Settings,
  ArrowLeft,
  Star,
  Calendar,
  Plus,
  Filter,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { BudgetOverviewTab } from "./budget-overview-tab";
import { BudgetSettingsTab } from "./budget-settings-tab";
import { ExpenseDefinitionModal } from "./expense-definition-modal";
import { AutoDetectExpensesDialog } from "./auto-detect-expenses-dialog";
import { ExpensePaidSection } from "./expense-paid-section";
import { ExpenseTimelineSection } from "./expense-timeline-section";
import {
  generateTimelineFromExpenses,
  condenseTimelineGroups,
  generatePaidInstances,
  condensePaidInstances,
  type CondensedExpense,
  type CondensedTimelineGroup,
} from "@/lib/expense-projections";
import { useBudget } from "@/contexts/budget-context";
import { useBudgetLayoutSettings } from "@/hooks/use-budget-layout-settings";
import { BudgetSharingProvider, useBudgetSharing } from "@/contexts/budget-sharing-context";
import type { UserBudget } from "@/app/actions/budgets";
import type {
  BudgetRow as UIBudgetRow,
  SubcategoryBudgetRow,
} from "@/lib/budget-row-types";
import type { BudgetRow as EngineBudgetRow } from "@/lib/budget-engine";
import { hasPaymentInPeriod } from "@/lib/expense-projections";

// ── Slim data interface — only what the shell still needs from page.tsx ──

export interface BudgetShellData {
  partnershipId: string;
  accountIds?: string[];
  expenses?: any[];
  categoryMappings?: { upCategoryId: string; newParentName: string; newChildName: string; icon: string; displayOrder: number }[];
  initialUserId?: string;
  initialLayoutConfig?: any;
  nextPayDate?: string | null;
  initialCategoryShares?: { category_name: string; is_shared: boolean; share_percentage: number }[];
  initialSplitSettings?: { expense_definition_id?: string | null; category_name?: string | null; split_type: string; owner_percentage?: number | null }[];
}

interface BudgetPageShellProps {
  budget: UserBudget;
  budgetData: Record<string, unknown>;
  initialTab?: string;
}

/**
 * Translates engine `BudgetRow` (budgeted / spent / available, type-based) into
 * the UI `BudgetRow` shape (assigned / spent / displayOrder) consumed by tables.
 *
 * Key transformations:
 *  - Engine rows use "Parent::Child" composite keys as IDs; the UI needs just
 *    the child portion for display names.
 *  - Goal and asset IDs carry prefixes ("goal::uuid", "asset::uuid") that are
 *    stripped here so downstream components receive plain UUIDs.
 *  - Only subcategory, goal, and asset rows are emitted — parent category rows
 *    are omitted because the layout system handles grouping independently.
 */
function mapEngineRowsToUI(engineRows: EngineBudgetRow[]): UIBudgetRow[] {
  const result: UIBudgetRow[] = [];
  let displayIdx = 0;

  // Emit subcategory, goal, and asset rows directly — no parent category rows
  for (const row of engineRows) {
    if (row.type === "subcategory" && row.parentCategory) {
      // Defensive: if name contains "::" (parent::child key), use only the child portion
      const displayName = row.name.includes("::") ? row.name.split("::").pop()! : row.name;
      result.push({
        type: "subcategory",
        id: row.id,
        name: displayName,
        icon: (row as any).icon ?? "💸",
        assigned: row.budgeted,
        spent: row.spent,
        parentCategory: row.parentCategory,
        displayOrder: displayIdx++,
        isExpenseDefault: row.isExpenseDefault,
        expenseBudgetedCents: row.isExpenseDefault ? row.budgeted : undefined,
      } satisfies SubcategoryBudgetRow);
    } else if (row.type === "goal") {
      result.push({
        type: "goal",
        id: row.id.replace("goal::", ""),
        name: row.name,
        icon: (row as any).icon ?? "🎯",
        color: "#6366f1",
        assigned: row.budgeted,
        spent: row.spent,
        target: (row as any).target ?? 0,
        currentAmount: (row as any).currentAmount ?? 0,
        displayOrder: displayIdx++,
      } as UIBudgetRow);
    } else if (row.type === "asset") {
      result.push({
        type: "asset",
        id: row.id.replace("asset::", ""),
        name: row.name,
        icon: "📈",
        assetType: (row as any).assetType ?? "other",
        assigned: row.budgeted,
        spent: row.spent,
        currentValue: (row as any).currentValue ?? 0,
        displayOrder: displayIdx++,
      } as UIBudgetRow);
    }
  }

  return result;
}

// ── Mobile Recurring Tab (mirrors BudgetExpensesSidebar as full-width content) ──

function RecurringTabContent({
  expenses,
  periodStart,
  periodEnd,
  nextPayDate,
  showIndividual,
  setShowIndividual,
  showCompactTimeline,
  setShowCompactTimeline,
  onEditExpense,
  onAddExpense,
  onAutoDetect,
}: {
  expenses: any[];
  periodStart: Date;
  periodEnd: Date;
  nextPayDate?: string | null;
  showIndividual: boolean;
  setShowIndividual: (v: boolean) => void;
  showCompactTimeline: boolean;
  setShowCompactTimeline: (v: boolean) => void;
  onEditExpense: (expenseId: string) => void;
  onAddExpense: () => void;
  onAutoDetect: () => void;
}) {
  const paidInstances = useMemo(
    () => generatePaidInstances(expenses, periodStart, periodEnd),
    [expenses, periodStart, periodEnd]
  );

  const condensedPaidExpenses = useMemo(
    () => condensePaidInstances(paidInstances),
    [paidInstances]
  );

  const timelineGroups = useMemo(
    () => generateTimelineFromExpenses(expenses, 1, periodStart),
    [expenses, periodStart]
  );

  const condensedTimelineGroups = useMemo(
    () => condenseTimelineGroups(timelineGroups),
    [timelineGroups]
  );

  const displayTimelineGroups = useMemo((): CondensedTimelineGroup[] => {
    if (showIndividual) {
      return timelineGroups.map(group => ({
        key: group.key,
        label: group.label,
        totalAmount: group.totalAmount,
        isPast: group.isPast,
        expenses: group.expenses.map(expense => ({
          ...expense,
          occurrenceCount: 1,
          condensedLabel: expense.name,
          totalAmountCents: expense.expected_amount_cents,
          allOccurrences: [expense],
        })),
      }));
    }
    return condensedTimelineGroups;
  }, [showIndividual, timelineGroups, condensedTimelineGroups]);

  const dueBeforePayCents = useMemo(() => {
    if (!nextPayDate) return null;
    return displayTimelineGroups.reduce((total, group) => {
      for (const expense of group.expenses) {
        const occurrences = expense.allOccurrences || [expense];
        for (const occ of occurrences) {
          const dateKey = occ.projectedDate.toISOString().split("T")[0];
          if (dateKey < nextPayDate) {
            total += Math.abs(occ.expected_amount_cents);
          }
        }
      }
      return total;
    }, 0);
  }, [displayTimelineGroups, nextPayDate]);

  const unpaidCount = condensedTimelineGroups.reduce(
    (sum, group) => sum + group.expenses.reduce(
      (expSum, expense) => expSum + expense.occurrenceCount, 0
    ), 0
  );

  const handleExpenseClick = (expense: CondensedExpense) => {
    if (!expense.isProjection) {
      onEditExpense(expense.id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border shadow-lg overflow-hidden"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5" style={{ color: "var(--pastel-coral-dark)" }} />
          <h2
            className="font-[family-name:var(--font-nunito)] font-bold text-base"
            style={{ color: "var(--text-primary)" }}
          >
            Recurring Expenses
          </h2>
          <Badge variant="secondary" className="text-xs">
            {unpaidCount} due
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Filter options">
                <Filter
                  className="h-4 w-4"
                  style={{ color: (showIndividual || showCompactTimeline) ? "var(--pastel-coral-dark)" : "var(--text-secondary)" }}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuCheckboxItem checked={showIndividual} onCheckedChange={setShowIndividual}>
                Show individual payments
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showCompactTimeline} onCheckedChange={setShowCompactTimeline}>
                Compact timeline view
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={onAddExpense} className="h-7 w-7" title="Add expense">
            <Plus className="h-4 w-4" style={{ color: "var(--pastel-blue-dark)" }} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onAutoDetect} className="h-7 w-7" title="Auto-detect expenses">
            <Sparkles className="h-4 w-4" style={{ color: "var(--pastel-yellow-dark)" }} />
          </Button>
        </div>
      </div>

      {/* Paid Section */}
      <ExpensePaidSection
        condensedExpenses={condensedPaidExpenses}
        instances={paidInstances}
        showIndividual={showIndividual}
        defaultCollapsed={true}
        onEditExpense={onEditExpense}
      />

      {/* Timeline Sections */}
      <div className="p-3 space-y-4">
        {displayTimelineGroups.length === 0 ? (
          <div className="p-6 text-center">
            <div
              className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-2"
              style={{ backgroundColor: "var(--pastel-mint-light)" }}
            >
              <Calendar className="h-5 w-5" style={{ color: "var(--pastel-mint-dark)" }} />
            </div>
            <p
              className="font-[family-name:var(--font-dm-sans)] text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {paidInstances.length > 0 ? "All expenses are paid!" : "No expenses scheduled"}
            </p>
          </div>
        ) : (
          displayTimelineGroups.map((group, index) => (
            <ExpenseTimelineSection
              key={group.key}
              group={group}
              onExpenseClick={handleExpenseClick}
              onEditExpense={onEditExpense}
              isLast={index === displayTimelineGroups.length - 1}
              compact={showCompactTimeline}
              nextPayDate={nextPayDate}
              dueBeforePayCents={dueBeforePayCents}
            />
          ))
        )}
      </div>
    </motion.div>
  );
}

// ── Outer shell: wraps BudgetSharingProvider ──

export function BudgetPageShell({
  budget,
  budgetData,
  initialTab,
}: BudgetPageShellProps) {
  const data = budgetData as unknown as BudgetShellData;
  const {
    partnershipId,
    initialCategoryShares = [],
    initialSplitSettings = [],
  } = data;

  return (
    <BudgetSharingProvider
      partnershipId={partnershipId}
      initialCategoryShares={initialCategoryShares}
      initialSplitSettings={initialSplitSettings.map(s => ({
        expense_definition_id: s.expense_definition_id ?? undefined,
        category_name: s.category_name ?? undefined,
        split_type: s.split_type,
        owner_percentage: s.owner_percentage ?? undefined,
      }))}
    >
      <BudgetPageShellContent budget={budget} budgetData={budgetData} initialTab={initialTab} />
    </BudgetSharingProvider>
  );
}

// ── Inner shell: uses contexts, maps engine data, renders tabs ──

function BudgetPageShellContent({
  budget: _initialBudget,
  budgetData,
  initialTab,
}: BudgetPageShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = initialTab ?? searchParams.get("tab") ?? "overview";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const data = budgetData as unknown as BudgetShellData;
  const {
    partnershipId,
    accountIds = [],
    expenses = [],
    categoryMappings = [],
    initialUserId,
    initialLayoutConfig,
    nextPayDate,
  } = data;

  // ── New budget context (replaces useBudgetZero) ──
  const {
    budget,
    summary,
    currentDate,
    navigatePeriod,
    setDate,
    assignAmount,
    refresh,
  } = useBudget();

  // ── Local state ──
  const [userId, setUserId] = useState<string>(initialUserId || "");
  const [showRecurringExpenseModal, setShowRecurringExpenseModal] = useState(false);
  const [selectedRecurringExpense, setSelectedRecurringExpense] = useState<any | null>(null);
  const [showRecurringAutoDetect, setShowRecurringAutoDetect] = useState(false);
  const [showIndividual, setShowIndividual] = useState(false);
  const [showCompactTimeline, setShowCompactTimeline] = useState(false);

  useEffect(() => {
    async function getUserId() {
      const supabase = (await import("@/utils/supabase/client")).createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    getUserId();
  }, []);

  // Layout settings
  const { layout: layoutConfig, refresh: refreshLayout } = useBudgetLayoutSettings({
    partnershipId,
    userId: userId || undefined,
    budgetId: budget.id,
    initialLayout: initialLayoutConfig,
    budgetView: budget.budget_view,
  });

  // ── Enrich expenses with split data for individual budget view ──
  const { expenseSplits } = useBudgetSharing();

  // In "individual" budget view, recurring expenses need their amounts scaled
  // by the user's split percentage. `expenseSplits` (from BudgetSharingProvider)
  // maps `expense:{id}` keys to per-expense split info. The original amount is
  // preserved as `original_amount_cents` so the UI can show "your share of X".
  const viewAdjustedExpenses = useMemo(() => {
    if (budget.budget_view !== "individual") return expenses;

    return expenses.map((expense: any) => {
      const splitKey = `expense:${expense.id}`;
      const split = expenseSplits.get(splitKey);

      if (split) {
        const pct = split.ownerPercentage;
        return {
          ...expense,
          is_shared: true,
          split_percentage: pct,
          original_amount_cents: expense.expected_amount_cents,
          expected_amount_cents: Math.round(expense.expected_amount_cents * pct / 100),
        };
      }

      return expense;
    });
  }, [expenses, expenseSplits, budget.budget_view]);

  // `is_matched` from SSR reflects the *initial* page-load period. When the user
  // navigates to a different period the SSR value becomes stale, so we recalculate
  // it client-side using `hasPaymentInPeriod()` against the current period
  // boundaries. This keeps the Expected Bills card in the detail panel accurate.
  const periodAwareExpenses = useMemo(() => {
    if (!summary?.periodStart || !summary?.periodEnd) return viewAdjustedExpenses;
    const pStart = new Date(summary.periodStart);
    const pEnd = new Date(summary.periodEnd);
    return viewAdjustedExpenses.map((expense: any) => ({
      ...expense,
      is_matched: hasPaymentInPeriod(expense, pStart, pEnd),
    }));
  }, [viewAdjustedExpenses, summary?.periodStart, summary?.periodEnd]);

  // ── Map engine rows to UI rows ──
  const engineItems: UIBudgetRow[] = useMemo(() => {
    if (!summary) return [];
    return mapEngineRowsToUI(summary.rows);
  }, [summary]);

  // Engine now returns complete rows for all goals/assets/layout subcategories in
  // every period — no client-side placeholder supplement needed anymore.
  const allBudgetItems = engineItems;

  // ── Assignment handlers ──
  const handleAssignCategory = useCallback(
    async (name: string, amount: number, subcategoryName?: string) => {
      await assignAmount({
        partnershipId,
        categoryName: name,
        subcategoryName,
        amountCents: amount,
      });
    },
    [assignAmount, partnershipId]
  );

  const handleAssignGoal = useCallback(
    async (goalId: string, amountCents: number) => {
      await assignAmount({
        partnershipId,
        categoryName: "",
        goalId,
        assignmentType: "goal",
        amountCents,
      });
    },
    [assignAmount, partnershipId]
  );

  const handleAssignAsset = useCallback(
    async (assetId: string, amountCents: number) => {
      await assignAmount({
        partnershipId,
        categoryName: "",
        assetId,
        assignmentType: "asset",
        amountCents,
      });
    },
    [assignAmount, partnershipId]
  );

  // ── Tab handling ──
  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      params.set("id", budget.slug || budget.id);
      window.history.replaceState(null, "", `/budget?${params.toString()}`);
    },
    [searchParams, budget.slug, budget.id]
  );

  const periodType = budget.period_type || "monthly";

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="p-4 md:p-6 lg:p-8">
        {/* Budget header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4 md:mb-6"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/budget")}
            className="mb-3 cursor-pointer -ml-2"
            style={{ color: "var(--text-secondary)" }}
          >
            <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            All Budgets
          </Button>

          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">
              {budget.emoji}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className="font-[family-name:var(--font-nunito)] text-xl md:text-2xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {budget.name}
                </h1>
                {budget.is_default && (
                  <Star
                    className="w-4 h-4 fill-current"
                    style={{ color: "var(--brand-coral)" }}
                    aria-label="Default budget"
                  />
                )}
              </div>
              <span
                className="text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                {budget.methodology === "50-30-20"
                  ? "50/30/20"
                  : budget.methodology === "pay-yourself-first"
                    ? "Pay Yourself First"
                    : budget.methodology === "zero-based"
                      ? "Zero-Based"
                      : budget.methodology === "80-20"
                        ? "80/20"
                        : budget.methodology}
                {" \u00B7 "}
                {periodType.charAt(0).toUpperCase() +
                  periodType.slice(1)}
                {" \u00B7 "}
                {budget.budget_view === "shared" ? "Ours" : "Mine"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Plan-style underline tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList variant="underline" className="mb-4 md:mb-6">
            <TabsTrigger value="overview" className="cursor-pointer">
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="recurring" className="cursor-pointer lg:hidden">
              <Calendar className="w-4 h-4" aria-hidden="true" />
              Recurring
            </TabsTrigger>
            <TabsTrigger value="settings" className="cursor-pointer">
              <Settings className="w-4 h-4" aria-hidden="true" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <BudgetOverviewTab
              budget={budget}
              allBudgetItems={allBudgetItems}
              expenses={periodAwareExpenses}
              partnershipId={partnershipId}
              accountIds={accountIds}
              layoutConfig={layoutConfig}
              nextPayDate={nextPayDate}
              userId={userId}
              categoryMappings={categoryMappings}
              onAssignCategory={handleAssignCategory}
              onAssignGoal={handleAssignGoal}
              onAssignAsset={handleAssignAsset}
              refreshData={refresh}
            />
          </TabsContent>

          <TabsContent value="recurring" className="lg:hidden">
            <RecurringTabContent
              expenses={periodAwareExpenses}
              periodStart={summary?.periodStart ? new Date(summary.periodStart) : new Date()}
              periodEnd={summary?.periodEnd ? new Date(summary.periodEnd) : new Date()}
              nextPayDate={nextPayDate}
              showIndividual={showIndividual}
              setShowIndividual={setShowIndividual}
              showCompactTimeline={showCompactTimeline}
              setShowCompactTimeline={setShowCompactTimeline}
              onEditExpense={(expenseId) => {
                const expense = periodAwareExpenses.find((e: any) => e.id === expenseId);
                if (expense) { setSelectedRecurringExpense(expense); setShowRecurringExpenseModal(true); }
              }}
              onAddExpense={() => { setSelectedRecurringExpense(null); setShowRecurringExpenseModal(true); }}
              onAutoDetect={() => setShowRecurringAutoDetect(true)}
            />
            <ExpenseDefinitionModal
              open={showRecurringExpenseModal}
              onClose={() => { setShowRecurringExpenseModal(false); setSelectedRecurringExpense(null); }}
              partnershipId={partnershipId}
              categories={categoryMappings.map(c => c.newParentName).filter((v, i, a) => a.indexOf(v) === i)}
              expense={selectedRecurringExpense}
              initialSplit={selectedRecurringExpense?.split_percentage ? { isShared: true, splitPercentage: selectedRecurringExpense.split_percentage } : null}
            />
            <AutoDetectExpensesDialog
              open={showRecurringAutoDetect}
              onClose={() => setShowRecurringAutoDetect(false)}
              partnershipId={partnershipId}
              categories={categoryMappings.map(c => c.newParentName).filter((v, i, a) => a.indexOf(v) === i)}
            />
          </TabsContent>

          <TabsContent value="settings">
            <BudgetSettingsTab
              budget={budget}
              partnershipId={partnershipId}
              allItems={allBudgetItems}
              userId={userId}
              layoutConfig={layoutConfig}
              onLayoutSaved={refreshLayout}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
