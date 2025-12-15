"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/budget-zero-calculations";

interface ExpenseData {
  id: string;
  name: string;
  expected_amount_cents: number;
  next_due_date: string;
  emoji: string;
  is_matched?: boolean;
  matched_amount?: number;
  matched_date?: string;
}

interface ExpectedExpenseIndicatorProps {
  expenses: ExpenseData[];
  onExpenseClick?: (expenseId: string) => void;
}

export function ExpectedExpenseIndicator({
  expenses,
  onExpenseClick,
}: ExpectedExpenseIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!expenses || expenses.length === 0) return null;

  const matchedCount = expenses.filter(e => e.is_matched).length;
  const totalExpected = expenses.reduce((sum, e) => sum + e.expected_amount_cents, 0);
  const totalMatched = expenses.reduce((sum, e) => sum + (e.is_matched ? e.matched_amount || 0 : 0), 0);

  // Determine status color
  const isFullyMatched = matchedCount === expenses.length;
  const hasOverdue = expenses.some(e => {
    const dueDate = new Date(e.next_due_date);
    return dueDate < new Date() && !e.is_matched;
  });

  const statusColor = hasOverdue
    ? 'var(--pastel-coral)'
    : isFullyMatched
    ? 'var(--pastel-mint)'
    : 'var(--pastel-yellow)';

  const statusColorLight = hasOverdue
    ? 'var(--pastel-coral-light)'
    : isFullyMatched
    ? 'var(--pastel-mint-light)'
    : 'var(--pastel-yellow-light)';

  const statusColorDark = hasOverdue
    ? 'var(--pastel-coral-dark)'
    : isFullyMatched
    ? 'var(--pastel-mint-dark)'
    : 'var(--pastel-yellow-dark)';

  return (
    <div className="my-2">
      {/* Compact Badge */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-3 py-2 rounded-lg transition-all"
        style={{
          backgroundColor: statusColorLight,
          border: `1px solid ${statusColor}`,
        }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasOverdue ? (
              <AlertCircle className="h-4 w-4" style={{ color: statusColorDark }} />
            ) : isFullyMatched ? (
              <CheckCircle className="h-4 w-4" style={{ color: statusColorDark }} />
            ) : (
              <Clock className="h-4 w-4" style={{ color: statusColorDark }} />
            )}

            <span
              className="text-xs font-[family-name:var(--font-dm-sans)] font-medium"
              style={{ color: statusColorDark }}
            >
              {expenses.length} Expense{expenses.length !== 1 ? 's' : ''} • {matchedCount} Matched
            </span>
          </div>

          {isExpanded ? (
            <ChevronUp className="h-4 w-4" style={{ color: statusColorDark }} />
          ) : (
            <ChevronDown className="h-4 w-4" style={{ color: statusColorDark }} />
          )}
        </div>
      </motion.button>

      {/* Expanded List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {expenses.map((expense, index) => {
                const isOverdue = new Date(expense.next_due_date) < new Date() && !expense.is_matched;
                const expenseColor = isOverdue
                  ? 'var(--pastel-coral)'
                  : expense.is_matched
                  ? 'var(--pastel-mint)'
                  : 'var(--pastel-yellow)';

                const expenseColorLight = isOverdue
                  ? 'var(--pastel-coral-light)'
                  : expense.is_matched
                  ? 'var(--pastel-mint-light)'
                  : 'var(--pastel-yellow-light)';

                const expenseColorDark = isOverdue
                  ? 'var(--pastel-coral-dark)'
                  : expense.is_matched
                  ? 'var(--pastel-mint-dark)'
                  : 'var(--pastel-yellow-dark)';

                return (
                  <motion.div
                    key={expense.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => onExpenseClick?.(expense.id)}
                    className="p-3 rounded-lg cursor-pointer transition-all"
                    style={{
                      backgroundColor: expenseColorLight,
                      border: `1px solid ${expenseColor}`,
                    }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{expense.emoji}</span>
                        <div>
                          <p
                            className="text-sm font-[family-name:var(--font-dm-sans)] font-medium"
                            style={{ color: expenseColorDark }}
                          >
                            {expense.name}
                          </p>
                          <p className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
                            Due: {new Date(expense.next_due_date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className="text-sm font-[family-name:var(--font-nunito)] font-bold"
                          style={{ color: expenseColorDark }}
                        >
                          {formatCurrency(expense.expected_amount_cents)}
                        </p>
                        {expense.is_matched ? (
                          <Badge
                            className="text-xs px-1.5 py-0"
                            style={{
                              backgroundColor: 'var(--pastel-mint)',
                              color: 'var(--pastel-mint-dark)'
                            }}
                          >
                            Paid
                          </Badge>
                        ) : isOverdue ? (
                          <Badge
                            className="text-xs px-1.5 py-0"
                            style={{
                              backgroundColor: 'var(--pastel-coral)',
                              color: 'var(--pastel-coral-dark)'
                            }}
                          >
                            Overdue
                          </Badge>
                        ) : (
                          <Badge
                            className="text-xs px-1.5 py-0"
                            style={{
                              backgroundColor: 'var(--pastel-yellow)',
                              color: 'var(--pastel-yellow-dark)'
                            }}
                          >
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Summary */}
              <div className="pt-2 mt-2 border-t" style={{ borderColor: statusColor }}>
                <div className="flex justify-between text-xs font-[family-name:var(--font-dm-sans)]">
                  <span style={{ color: 'var(--text-secondary)' }}>Total Expected</span>
                  <span style={{ color: statusColorDark }}>{formatCurrency(totalExpected)}</span>
                </div>
                <div className="flex justify-between text-xs font-[family-name:var(--font-dm-sans)] mt-1">
                  <span style={{ color: 'var(--text-secondary)' }}>Total Matched</span>
                  <span style={{ color: statusColorDark }}>{formatCurrency(totalMatched)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
