"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Pencil } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/budget-zero-calculations";
import { cn } from "@/lib/utils";
import type {
  ExpenseData,
  CondensedPaidExpense,
  PaidExpenseInstance,
} from "@/lib/expense-projections";

interface ExpensePaidSectionProps {
  // Condensed view data (default)
  condensedExpenses?: CondensedPaidExpense[];
  // Individual instances view data
  instances?: PaidExpenseInstance[];
  // Which view mode to display
  showIndividual?: boolean;
  // Legacy prop for backwards compatibility
  expenses?: ExpenseData[];
  defaultCollapsed?: boolean;
  onEditExpense?: (expenseId: string) => void;
  onExpenseClick?: (expense: ExpenseData) => void;
  className?: string;
}

export function ExpensePaidSection({
  condensedExpenses = [],
  instances = [],
  showIndividual = false,
  expenses = [],
  defaultCollapsed = true,
  onEditExpense,
  onExpenseClick,
  className,
}: ExpensePaidSectionProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);

  // Determine which data to display based on view mode and what's provided
  // If new props are provided, use them; otherwise fall back to legacy expenses prop
  const hasNewData = condensedExpenses.length > 0 || instances.length > 0;

  // Count of items to display
  const displayCount = hasNewData
    ? (showIndividual ? instances.length : condensedExpenses.length)
    : expenses.length;

  // Total count (always individual instances for accurate count)
  const totalInstanceCount = hasNewData ? instances.length : expenses.length;

  if (displayCount === 0 && expenses.length === 0) return null;

  // Calculate total paid amount
  const totalPaid = hasNewData
    ? instances.reduce((sum, inst) => sum + (inst.matched_amount || inst.expected_amount_cents), 0)
    : expenses.reduce((sum, e) => sum + (e.matched_amount || e.expected_amount_cents), 0);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("border-b", className)}
      style={{ borderColor: "var(--border)" }}
    >
      {/* Trigger Header */}
      <CollapsibleTrigger className="w-full">
        <div
          className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-[var(--pastel-mint-light)]"
          style={{ backgroundColor: isOpen ? "var(--pastel-mint-light)" : "transparent" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--pastel-mint)" }}
            >
              <Check
                className="h-3 w-3"
                style={{ color: "var(--pastel-mint-dark)" }}
              />
            </div>
            <span
              className="font-[family-name:var(--font-dm-sans)] text-xs font-semibold"
              style={{ color: "var(--pastel-mint-dark)" }}
            >
              Paid This Period
            </span>
            <span
              className="font-[family-name:var(--font-dm-sans)] text-[11px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--pastel-mint)",
                color: "var(--pastel-mint-dark)",
              }}
            >
              {totalInstanceCount}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="font-[family-name:var(--font-nunito)] text-xs font-bold"
              style={{ color: "var(--pastel-mint-dark)" }}
            >
              {formatCurrency(totalPaid)}
            </span>
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown
                className="h-4 w-4"
                style={{ color: "var(--pastel-mint-dark)" }}
              />
            </motion.div>
          </div>
        </div>
      </CollapsibleTrigger>

      {/* Collapsible Content */}
      <CollapsibleContent>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="px-2 py-1 space-y-0.5"
              style={{ backgroundColor: "var(--pastel-mint-light)" }}
            >
              {/* Render based on view mode */}
              {hasNewData ? (
                // New data format - condensed or individual view
                showIndividual ? (
                  // Individual instances view
                  instances.map((instance, index) => (
                    <ExpenseItem
                      key={instance.transaction_id || `${instance.id}-${index}`}
                      expense={instance}
                      index={index}
                      displayName={instance.name}
                      onExpenseClick={onExpenseClick}
                      onEditExpense={onEditExpense}
                    />
                  ))
                ) : (
                  // Condensed view
                  condensedExpenses.map((condensed, index) => (
                    <ExpenseItem
                      key={condensed.id}
                      expense={condensed}
                      index={index}
                      displayName={condensed.name}
                      displayAmount={condensed.totalAmountCents}
                      occurrenceCount={condensed.occurrenceCount}
                      onExpenseClick={onExpenseClick}
                      onEditExpense={onEditExpense}
                    />
                  ))
                )
              ) : (
                // Legacy expenses format
                expenses.map((expense, index) => (
                  <ExpenseItem
                    key={expense.id}
                    expense={expense}
                    index={index}
                    displayName={expense.name}
                    onExpenseClick={onExpenseClick}
                    onEditExpense={onEditExpense}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Extracted expense item component
interface ExpenseItemProps {
  expense: ExpenseData | CondensedPaidExpense | PaidExpenseInstance;
  index: number;
  displayName: string;
  displayAmount?: number;
  occurrenceCount?: number;
  onExpenseClick?: (expense: ExpenseData) => void;
  onEditExpense?: (expenseId: string) => void;
}

function ExpenseItem({
  expense,
  index,
  displayName,
  displayAmount,
  occurrenceCount,
  onExpenseClick,
  onEditExpense,
}: ExpenseItemProps) {
  const amount = displayAmount ?? expense.matched_amount ?? expense.expected_amount_cents;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-white/50"
    >
      {/* Clickable area */}
      <button
        onClick={() => onExpenseClick?.(expense as ExpenseData)}
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
      >
        {/* Checkmark & Emoji */}
        <div className="relative flex-shrink-0">
          <span className="text-base opacity-60">{expense.emoji}</span>
          <div
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--pastel-mint)" }}
          >
            <Check
              className="h-2 w-2"
              style={{ color: "white" }}
            />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p
              className="font-[family-name:var(--font-nunito)] text-sm font-semibold truncate line-through opacity-70"
              style={{ color: "var(--text-primary)" }}
            >
              {displayName}
            </p>
            {occurrenceCount && occurrenceCount > 1 && (
              <span
                className="font-[family-name:var(--font-dm-sans)] text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                style={{
                  backgroundColor: "var(--pastel-mint)",
                  color: "var(--pastel-mint-dark)",
                }}
              >
                ×{occurrenceCount}
              </span>
            )}
          </div>
          <p
            className="font-[family-name:var(--font-dm-sans)] text-[11px] truncate"
            style={{ color: "var(--text-tertiary)" }}
          >
            {expense.category_name}
          </p>
        </div>
      </button>

      {/* Amount & Date */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span
          className="font-[family-name:var(--font-nunito)] text-sm font-bold"
          style={{ color: "var(--pastel-mint-dark)" }}
        >
          {formatCurrency(amount)}
        </span>
        {expense.matched_date && (
          <span
            className="font-[family-name:var(--font-dm-sans)] text-[10px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            {new Date(expense.matched_date).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
      </div>

      {/* Edit button */}
      {onEditExpense && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEditExpense(expense.id);
          }}
          className="flex-shrink-0 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/70"
          title="Edit expense"
        >
          <Pencil
            className="h-3.5 w-3.5"
            style={{ color: "var(--text-secondary)" }}
          />
        </button>
      )}
    </motion.div>
  );
}
