"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { BudgetOverviewStrip } from "./budget-overview-strip";
import { UnifiedBudgetTable } from "./unified-budget-table";
import { ExpenseDefinitionModal } from "./expense-definition-modal";
import { AutoDetectExpensesDialog } from "./auto-detect-expenses-dialog";
import { AssignmentDistributionModal } from "./assignment-distribution-modal";
import { BudgetDetailPanel } from "./budget-detail-panel";
import { BudgetExpensesSidebar } from "./budget-expenses-sidebar";
import { BudgetExpensesSheet } from "./budget-expenses-sheet";
import { FloatingDevTools } from "@/components/dev/floating-dev-tools";
import { useBudget } from "@/contexts/budget-context";
import { useBudgetSharing } from "@/contexts/budget-sharing-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { motion, AnimatePresence } from "framer-motion";
import { generateItemId } from "@/lib/layout-persistence";
import { isSubcategoryRow } from "@/lib/budget-row-types";
import type { UserBudget } from "@/app/actions/budgets";
import type { ExpenseWithMatches } from "@/lib/expense-projections";

interface BudgetOverviewTabProps {
  budget: UserBudget;
  allBudgetItems: any[];
  expenses: ExpenseWithMatches[];
  partnershipId: string;
  accountIds: string[];
  layoutConfig: any;
  nextPayDate?: string | null;
  userId: string;
  categoryMappings: any[];
  onAssignCategory: (name: string, amount: number, subcategoryName?: string) => Promise<void>;
  onAssignGoal: (id: string, amount: number) => Promise<void>;
  onAssignAsset: (id: string, amount: number) => Promise<void>;
  refreshData: () => Promise<void>;
}

export function BudgetOverviewTab({
  budget,
  allBudgetItems,
  expenses,
  partnershipId,
  accountIds,
  layoutConfig,
  nextPayDate,
  userId,
  categoryMappings,
  onAssignCategory,
  onAssignGoal,
  onAssignAsset,
  refreshData,
}: BudgetOverviewTabProps) {
  const {
    summary,
    currentDate,
    navigatePeriod,
    setDate,
  } = useBudget();

  const { expenseSplits } = useBudgetSharing();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // ── Local state ──
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAutoDetect, setShowAutoDetect] = useState(false);
  const [showDistributionModal, setShowDistributionModal] = useState(false);
  const [distributionContext, setDistributionContext] = useState<{
    categoryName: string;
    amount: number;
    underlyingCategories: string[];
  } | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showExpensesSidebar, setShowExpensesSidebar] = useState(true);
  const [showExpensesSheet, setShowExpensesSheet] = useState(false);

  // Derived values from summary
  const tbb = summary?.tbb ?? 0;
  const income = summary?.income ?? 0;
  const periodType = budget.period_type || "monthly";
  const periodStart = summary?.periodStart ? summary.periodStart.split('T')[0] : new Date().toISOString().split('T')[0];
  const periodEnd = summary?.periodEnd ? summary.periodEnd.split('T')[0] : new Date().toISOString().split('T')[0];

  // Calculate totals from visible items only (same filtering as UnifiedBudgetTable)
  const { visibleBudgeted, visibleSpent } = useMemo(() => {
    const HIDDEN_CATEGORIES = new Set(['Internal Transfers', 'External Transfers']);
    const hiddenItemIds = new Set(layoutConfig?.hiddenItemIds || []);

    const getItemDragId = (item: typeof allBudgetItems[number]) => {
      if (isSubcategoryRow(item)) {
        return generateItemId(item.type, item.name, item.parentCategory);
      }
      return generateItemId(item.type, item.type === 'category' ? item.name : item.id);
    };

    let budgeted = 0;
    let spent = 0;
    for (const item of allBudgetItems) {
      if (HIDDEN_CATEGORIES.has(item.name)) continue;
      if (hiddenItemIds.has(getItemDragId(item)) && item.spent <= 0) continue;
      budgeted += item.assigned;
      spent += item.spent;
    }
    return { visibleBudgeted: budgeted, visibleSpent: spent };
  }, [allBudgetItems, layoutConfig?.hiddenItemIds]);

  return (
    <motion.div
      className="space-y-3 md:space-y-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* TBB + Period Navigation Strip */}
      <BudgetOverviewStrip
        toBeBudgeted={tbb}
        income={income}
        budgeted={visibleBudgeted}
        spent={visibleSpent}
        currentPeriod={currentDate}
        periodType={periodType}
        onPrevious={() => navigatePeriod("prev")}
        onNext={() => navigatePeriod("next")}
        onDateSelect={(date) => setDate(date)}
      />

      <div className="space-y-3">
        {/* Main Content Area */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <UnifiedBudgetTable
              items={allBudgetItems}
              expenses={expenses}
              onAssignCategory={onAssignCategory}
              onAssignGoal={onAssignGoal}
              onAssignAsset={onAssignAsset}
              partnershipId={partnershipId}
              periodStart={periodStart}
              periodEnd={periodEnd}
              onEditExpense={(expenseId) => {
                const expense = expenses.find(e => e.id === expenseId);
                if (expense) { setSelectedExpense(expense); setShowExpenseModal(true); }
              }}
              onMethodologyAssignmentRequest={(categoryName, amount, underlyingCategories) => {
                setDistributionContext({ categoryName, amount, underlyingCategories });
                setShowDistributionModal(true);
              }}
              layoutConfig={layoutConfig}
              income={income}
              budgetPeriod={periodType}
              onItemClick={setSelectedItem}
              searchQuery={searchQuery}
            />
          </div>

          {/* Detail Panel */}
          <AnimatePresence>
            {selectedItem && (
              <BudgetDetailPanel
                key="detail-panel"
                item={selectedItem}
                expenses={expenses}
                partnershipId={partnershipId}
                periodStart={periodStart}
                periodEnd={periodEnd}
                onClose={() => setSelectedItem(null)}
                onEditExpense={(expenseId) => {
                  const expense = expenses.find(e => e.id === expenseId);
                  if (expense) { setSelectedExpense(expense); setShowExpenseModal(true); }
                }}
              />
            )}
          </AnimatePresence>

          {/* Desktop Expenses Sidebar */}
          <AnimatePresence>
            {isDesktop && showExpensesSidebar && (
              <BudgetExpensesSidebar
                expenses={expenses}
                periodStart={new Date(periodStart)}
                periodEnd={new Date(periodEnd)}
                onEditExpense={(expenseId) => {
                  const expense = expenses.find(e => e.id === expenseId);
                  if (expense) { setSelectedExpense(expense); setShowExpenseModal(true); }
                }}
                onExpenseClick={(expense) => {
                  const matchingCategory = allBudgetItems.find(
                    item => item.type === 'category' && item.name === expense.category_name
                  );
                  if (matchingCategory) setSelectedItem(matchingCategory);
                }}
                onAddExpense={() => setShowExpenseModal(true)}
                onAutoDetect={() => setShowAutoDetect(true)}
                onClose={() => setShowExpensesSidebar(false)}
                remainingBudget={tbb}
                nextPayDate={nextPayDate}
              />
            )}
          </AnimatePresence>

          {/* Reopen sidebar button */}
          {isDesktop && !showExpensesSidebar && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowExpensesSidebar(true)}
              className="flex-shrink-0 h-9 w-9 rounded-xl self-start"
              title="Show recurring expenses"
            >
              <Calendar className="h-4 w-4" style={{ color: "var(--pastel-coral-dark)" }} />
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Expenses Sheet */}
      <BudgetExpensesSheet
        open={showExpensesSheet}
        onOpenChange={setShowExpensesSheet}
        expenses={expenses}
        periodStart={new Date(periodStart)}
        periodEnd={new Date(periodEnd)}
        onAddExpense={() => { setShowExpensesSheet(false); setShowExpenseModal(true); }}
        onEditExpense={(expenseId) => {
          const expense = expenses.find(e => e.id === expenseId);
          if (expense) { setShowExpensesSheet(false); setSelectedExpense(expense); setShowExpenseModal(true); }
        }}
        onExpenseClick={(expense) => {
          const matchingCategory = allBudgetItems.find(
            item => item.type === 'category' && item.name === expense.category_name
          );
          if (matchingCategory) setSelectedItem(matchingCategory);
        }}
        onAutoDetect={() => { setShowExpensesSheet(false); setShowAutoDetect(true); }}
        remainingBudget={tbb}
        nextPayDate={nextPayDate}
      />

      {/* Modals */}
      <ExpenseDefinitionModal
        open={showExpenseModal}
        onClose={() => { setShowExpenseModal(false); setSelectedExpense(null); }}
        partnershipId={partnershipId}
        categories={allBudgetItems.filter((i: any) => i.type === 'subcategory').map((c: any) => c.name)}
        expense={selectedExpense}
        initialSplit={(() => {
          if (!selectedExpense) return null;
          const split = expenseSplits.get(`expense:${selectedExpense.id}`);
          if (!split) return null;
          return { isShared: true, splitPercentage: split.ownerPercentage };
        })()}
      />

      <AutoDetectExpensesDialog
        open={showAutoDetect}
        onClose={() => setShowAutoDetect(false)}
        partnershipId={partnershipId}
        categories={allBudgetItems.filter((i: any) => i.type === 'subcategory').map((c: any) => c.name)}
      />

      <AssignmentDistributionModal
        open={showDistributionModal}
        onOpenChange={(open) => {
          setShowDistributionModal(open);
          if (!open) setDistributionContext(null);
        }}
        methodologyCategory={distributionContext?.categoryName || ''}
        totalAmount={distributionContext?.amount || 0}
        underlyingCategories={distributionContext?.underlyingCategories || []}
        categoryIcons={new Map()}
        partnershipId={partnershipId}
        onConfirm={async (distribution) => {
          for (const [catName, amount] of distribution.entries()) {
            await onAssignCategory(catName, amount);
          }
        }}
      />

      {process.env.NODE_ENV === 'development' && partnershipId && (
        <FloatingDevTools
          partnershipId={partnershipId}
          onClearLocalStorage={() => {
            Object.keys(localStorage)
              .filter(key => key.includes(partnershipId) || key.startsWith('budget_') || key.startsWith('dev_tools_'))
              .forEach(key => localStorage.removeItem(key));
            window.location.reload();
          }}
        />
      )}
    </motion.div>
  );
}
