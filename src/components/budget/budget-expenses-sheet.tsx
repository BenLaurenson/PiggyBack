"use client";

import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Plus, Sparkles } from "lucide-react";
import { ExpenseCashFlowSummary } from "./expense-cash-flow-summary";
import { ExpensePaidSection } from "./expense-paid-section";
import { ExpenseTimelineSection } from "./expense-timeline-section";
import {
  generateTimelineFromExpenses,
  separatePaidExpenses,
  calculateCashFlowSummary,
  condenseTimelineGroups,
  type ExpenseData,
  type CondensedExpense,
} from "@/lib/expense-projections";

interface BudgetExpensesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: ExpenseData[];
  periodStart: Date;
  periodEnd: Date;
  onAddExpense: () => void;
  onEditExpense: (expenseId: string) => void;
  onExpenseClick?: (expense: ExpenseData) => void;
  onAutoDetect?: () => void;
  remainingBudget?: number;
  monthsToProject?: number;
  nextPayDate?: string | null;
}

export function BudgetExpensesSheet({
  open,
  onOpenChange,
  expenses,
  periodStart,
  periodEnd,
  onAddExpense,
  onEditExpense,
  onExpenseClick,
  onAutoDetect,
  remainingBudget = 0,
  monthsToProject = 1, // Only show This Month + Next Month
  nextPayDate,
}: BudgetExpensesSheetProps) {
  // Separate paid and unpaid expenses for current period
  const { paid: paidExpenses, unpaid: unpaidExpenses } = useMemo(
    () => separatePaidExpenses(expenses, periodStart, periodEnd),
    [expenses, periodStart, periodEnd]
  );

  // Generate timeline groups with projections - only for UNPAID expenses
  // Paid expenses go in the paid section, not in the timeline
  const timelineGroups = useMemo(
    () => generateTimelineFromExpenses(unpaidExpenses, monthsToProject, new Date()),
    [unpaidExpenses, monthsToProject]
  );

  // Condense recurring expenses (e.g., "Gym x3")
  // No need to filter by is_matched anymore since we only project unpaid expenses
  const unpaidTimelineGroups = useMemo(() => {
    // Condense recurring expenses within each group
    return condenseTimelineGroups(timelineGroups);
  }, [timelineGroups]);

  // Calculate cash flow summary
  const cashFlowSummary = useMemo(
    () => calculateCashFlowSummary(timelineGroups, remainingBudget),
    [timelineGroups, remainingBudget]
  );

  // Total counts for header
  const totalExpenses = expenses.length;
  const unpaidCount = unpaidExpenses.length;

  // Handle expense click - convert CondensedExpense to ExpenseData
  const handleExpenseClick = (expense: CondensedExpense) => {
    // Only handle click for non-projections (real expenses)
    if (!expense.isProjection) {
      onOpenChange(false);
      if (onExpenseClick) {
        onExpenseClick(expense as ExpenseData);
      }
    }
  };

  // Handle edit expense
  const handleEditExpense = (expenseId: string) => {
    onOpenChange(false);
    onEditExpense(expenseId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar
                className="h-5 w-5"
                style={{ color: "var(--pastel-coral-dark)" }}
              />
              <SheetTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold">
                Recurring Expenses
              </SheetTitle>
              <span
                className="font-[family-name:var(--font-dm-sans)] text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--muted)",
                  color: "var(--text-secondary)",
                }}
              >
                {unpaidCount}/{totalExpenses}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {onAutoDetect && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    onOpenChange(false);
                    onAutoDetect();
                  }}
                  className="h-8 w-8"
                  title="Auto-detect expenses"
                >
                  <Sparkles
                    className="h-4 w-4"
                    style={{ color: "var(--pastel-yellow-dark)" }}
                  />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onAddExpense();
                }}
                className="h-8 px-2"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
          <SheetDescription className="text-left">
            Track your bills and recurring expenses
          </SheetDescription>
        </SheetHeader>

        {/* Cash Flow Summary */}
        <ExpenseCashFlowSummary summary={cashFlowSummary} />

        {/* Paid Section (Collapsible) */}
        <ExpensePaidSection
          expenses={paidExpenses}
          defaultCollapsed={true}
          onEditExpense={handleEditExpense}
          onExpenseClick={(expense) => {
            onOpenChange(false);
            onExpenseClick?.(expense);
          }}
        />

        {/* Timeline Sections */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {unpaidTimelineGroups.length === 0 ? (
              <div className="p-8 text-center">
                <div
                  className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: "var(--pastel-mint-light)" }}
                >
                  <Calendar
                    className="h-6 w-6"
                    style={{ color: "var(--pastel-mint-dark)" }}
                  />
                </div>
                <p
                  className="font-[family-name:var(--font-dm-sans)] text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {paidExpenses.length > 0
                    ? "All expenses are paid!"
                    : "No expenses scheduled"}
                </p>
              </div>
            ) : (
              unpaidTimelineGroups.map((group, index) => (
                <ExpenseTimelineSection
                  key={group.key}
                  group={group}
                  onExpenseClick={handleExpenseClick}
                  onEditExpense={handleEditExpense}
                  isLast={index === unpaidTimelineGroups.length - 1}
                  nextPayDate={nextPayDate}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
