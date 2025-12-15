"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, X, Sparkles, Plus, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpensePaidSection } from "./expense-paid-section";
import { ExpenseTimelineSection } from "./expense-timeline-section";
import {
  generateTimelineFromExpenses,
  condenseTimelineGroups,
  generatePaidInstances,
  condensePaidInstances,
  type ExpenseData,
  type ExpenseWithMatches,
  type CondensedExpense,
  type CondensedTimelineGroup,
} from "@/lib/expense-projections";

interface BudgetExpensesSidebarProps {
  expenses: ExpenseWithMatches[];
  periodStart: Date;
  periodEnd: Date;
  onEditExpense: (expenseId: string) => void;
  onExpenseClick?: (expense: ExpenseData) => void;
  onAddExpense?: () => void;
  onAutoDetect?: () => void;
  onClose: () => void;
  remainingBudget?: number;
  monthsToProject?: number;
  nextPayDate?: string | null;
  className?: string;
}

export function BudgetExpensesSidebar({
  expenses,
  periodStart,
  periodEnd,
  onEditExpense,
  onExpenseClick,
  onAddExpense,
  onAutoDetect,
  onClose,
  remainingBudget = 0,
  monthsToProject = 1, // Only show This Month + Next Month
  nextPayDate,
  className,
}: BudgetExpensesSidebarProps) {
  // Filter preference state
  const [showIndividual, setShowIndividual] = useState(false); // Uncondense all expenses
  const [showCompactTimeline, setShowCompactTimeline] = useState(false); // Compact date-grouped view

  // Generate paid instances from expense matches
  const paidInstances = useMemo(
    () => generatePaidInstances(expenses, periodStart, periodEnd),
    [expenses, periodStart, periodEnd]
  );

  // Condense paid instances (e.g., "Deft Real Estate ×2")
  const condensedPaidExpenses = useMemo(
    () => condensePaidInstances(paidInstances),
    [paidInstances]
  );


  // Generate timeline groups with projections from ALL expenses
  // This ensures "Next Month" shows ALL expenses, not just those unpaid this month
  // Use periodStart as reference date so "This Month" refers to the selected period
  const timelineGroups = useMemo(
    () => generateTimelineFromExpenses(expenses, monthsToProject, periodStart),
    [expenses, monthsToProject, periodStart]
  );

  // Condense recurring expenses (e.g., "Gym x3")
  const condensedTimelineGroups = useMemo(() => {
    // Condense recurring expenses within each group
    return condenseTimelineGroups(timelineGroups);
  }, [timelineGroups]);

  // Display groups - either condensed or individual based on filter
  const displayTimelineGroups = useMemo((): CondensedTimelineGroup[] => {
    if (showIndividual) {
      // Convert to individual format where each expense is separate with occurrenceCount=1
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

  // Calculate total due before payday across ALL groups
  // (the per-group calculation in ExpenseTimelineSection misses expenses in earlier groups)
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

  // Total counts for header
  // Count total PAID INSTANCES (not expense definitions) for accurate tracking
  const totalPaidInstances = paidInstances.length;
  const totalExpenseDefinitions = expenses.length;
  // Count unpaid items visible in timeline (including multipliers like "Gym x3" = 3)
  // Always count from condensed groups to get accurate total regardless of display mode
  const unpaidCount = condensedTimelineGroups.reduce(
    (sum, group) => sum + group.expenses.reduce(
      (expSum, expense) => expSum + expense.occurrenceCount,
      0
    ),
    0
  );

  // Handle expense click - convert CondensedExpense to ExpenseData
  const handleExpenseClick = (expense: CondensedExpense) => {
    // Only handle click for non-projections (real expenses)
    // For condensed expenses, use the first occurrence
    if (!expense.isProjection && onExpenseClick) {
      onExpenseClick(expense as ExpenseData);
    }
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className={cn(
        "flex-shrink-0 border overflow-hidden rounded-2xl shadow-lg flex flex-col",
        className
      )}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Calendar
            className="h-5 w-5"
            style={{ color: "var(--pastel-coral-dark)" }}
          />
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
          {/* Filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Filter options"
              >
                <Filter
                  className="h-4 w-4"
                  style={{ color: (showIndividual || showCompactTimeline) ? "var(--pastel-coral-dark)" : "var(--text-secondary)" }}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuCheckboxItem
                checked={showIndividual}
                onCheckedChange={setShowIndividual}
              >
                Show individual payments
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showCompactTimeline}
                onCheckedChange={setShowCompactTimeline}
              >
                Compact timeline view
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onAddExpense && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onAddExpense}
              className="h-7 w-7"
              title="Add expense"
            >
              <Plus
                className="h-4 w-4"
                style={{ color: "var(--pastel-blue-dark)" }}
              />
            </Button>
          )}
          {onAutoDetect && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onAutoDetect}
              className="h-7 w-7"
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
            size="icon"
            onClick={onClose}
            className="h-7 w-7"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Paid Section (Collapsible) */}
      <ExpensePaidSection
        condensedExpenses={condensedPaidExpenses}
        instances={paidInstances}
        showIndividual={showIndividual}
        defaultCollapsed={true}
        onEditExpense={onEditExpense}
        onExpenseClick={onExpenseClick}
      />

      {/* Timeline Sections */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {displayTimelineGroups.length === 0 ? (
            <div className="p-6 text-center">
              <div
                className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-2"
                style={{ backgroundColor: "var(--pastel-mint-light)" }}
              >
                <Calendar
                  className="h-5 w-5"
                  style={{ color: "var(--pastel-mint-dark)" }}
                />
              </div>
              <p
                className="font-[family-name:var(--font-dm-sans)] text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {paidInstances.length > 0
                  ? "All expenses are paid!"
                  : "No expenses scheduled"}
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
      </ScrollArea>
    </motion.div>
  );
}
