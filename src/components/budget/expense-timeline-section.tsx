"use client";

import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/budget-zero-calculations";
import { cn } from "@/lib/utils";
import { getCurrentDate } from "@/lib/demo-guard";
import { PayDayDivider } from "./pay-day-divider";
import type { CondensedTimelineGroup, CondensedExpense } from "@/lib/expense-projections";

interface ExpenseTimelineSectionProps {
  group: CondensedTimelineGroup;
  onExpenseClick?: (expense: CondensedExpense) => void;
  onEditExpense?: (expenseId: string) => void;
  isLast?: boolean;
  compact?: boolean;
  nextPayDate?: string | null;
  dueBeforePayCents?: number | null;
  className?: string;
}

// Status config for timeline nodes
type ExpenseStatus = "upcoming" | "due" | "overdue";

const statusColors: Record<ExpenseStatus, string> = {
  upcoming: "var(--pastel-blue)",
  due: "var(--pastel-yellow)",
  overdue: "var(--pastel-coral)",
};

/**
 * Get grace period for overdue determination based on recurrence frequency
 * More frequent payments (weekly) are more likely to have minor timing variations
 * Less frequent payments (monthly/quarterly) should be more consistent
 */
function getGracePeriodDays(recurrenceType: string): number {
  switch (recurrenceType) {
    case 'weekly':
      return 2; // Weekly payments can be 2 days late before showing as overdue
    case 'fortnightly':
      return 3; // Fortnightly gets 3 days grace
    case 'monthly':
      return 3; // Monthly also gets 3 days grace (common for bills)
    case 'quarterly':
      return 5; // Quarterly payments get more grace
    case 'yearly':
      return 7; // Yearly payments get a week grace
    default:
      return 0; // One-time or unknown: no grace
  }
}

/**
 * Calculate expense status based on due date with smart grace period
 * Considers recurrence frequency to avoid marking consistent payments as overdue
 */
function getExpenseStatus(expense: CondensedExpense): ExpenseStatus {
  const dueDate = expense.projectedDate;
  const today = getCurrentDate();
  today.setHours(0, 0, 0, 0);

  const daysUntilDue = Math.ceil(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Get grace period based on recurrence frequency
  const gracePeriod = getGracePeriodDays(expense.recurrence_type);

  // Only mark as overdue if past the grace period
  // (negative daysUntilDue means past due, so check if it exceeds grace period)
  if (daysUntilDue < -gracePeriod) return "overdue";

  // Within grace period but past due - show as "due" instead of overdue
  if (daysUntilDue < 0) return "due";

  // Coming due within 3 days
  if (daysUntilDue <= 3) return "due";

  return "upcoming";
}

/**
 * Format date relative to today
 */
function formatRelativeDate(date: Date): string {
  const today = getCurrentDate();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const daysUntil = Math.ceil(
    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d ago`;
  if (daysUntil <= 7) return `${daysUntil}d`;

  // For future dates, show the date
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Get the dominant status color for the group header node
 */
function getGroupNodeColor(group: CondensedTimelineGroup): string {
  // If any expense is overdue, show coral
  const hasOverdue = group.expenses.some(e => getExpenseStatus(e) === "overdue");
  if (hasOverdue) return statusColors.overdue;

  // If any expense is due soon, show yellow
  const hasDueSoon = group.expenses.some(e => getExpenseStatus(e) === "due");
  if (hasDueSoon) return statusColors.due;

  // Otherwise show blue
  return statusColors.upcoming;
}

/**
 * Group expenses by their projected date for compact view
 */
function groupExpensesByDate(expenses: CondensedExpense[]): Map<string, CondensedExpense[]> {
  const groups = new Map<string, CondensedExpense[]>();

  expenses.forEach(expense => {
    const dateKey = expense.projectedDate.toISOString().split('T')[0];
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(expense);
  });

  return groups;
}

/**
 * Format date for compact date header
 */
function formatDateHeader(date: Date): string {
  const today = getCurrentDate();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const daysUntil = Math.ceil(
    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";

  // Show day name for next 7 days
  if (daysUntil > 0 && daysUntil <= 7) {
    return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric" });
  }

  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export function ExpenseTimelineSection({
  group,
  onExpenseClick,
  onEditExpense,
  isLast = false,
  compact = false,
  nextPayDate,
  dueBeforePayCents: dueBeforePayCentsProp,
  className,
}: ExpenseTimelineSectionProps) {
  const nodeColor = getGroupNodeColor(group);

  // For compact mode, group expenses by date
  const expensesByDate = compact ? groupExpensesByDate(group.expenses) : null;

  // Only show the payday divider if the pay date falls within this group's month
  const payDateForGroup = (() => {
    if (!nextPayDate) return null;
    const payMonth = nextPayDate.slice(0, 7); // "2026-02"
    const now = getCurrentDate();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthKey = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

    if (group.key === "this-month" && payMonth === thisMonthKey) return nextPayDate;
    if (group.key === "next-month" && payMonth === nextMonthKey) return nextPayDate;
    if (group.key === payMonth) return nextPayDate;
    return null;
  })();

  // Use parent-provided cross-group total when available, otherwise fall back to local calculation
  const dueBeforePayCents = dueBeforePayCentsProp != null
    ? dueBeforePayCentsProp
    : payDateForGroup
      ? group.expenses.reduce((sum, expense) => {
          const occurrences = expense.allOccurrences || [expense];
          for (const occ of occurrences) {
            const dateKey = occ.projectedDate.toISOString().split("T")[0];
            if (dateKey < payDateForGroup) {
              sum += Math.abs(occ.expected_amount_cents);
            }
          }
          return sum;
        }, 0)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("timeline-section", className)}
    >
      {/* Clean Month Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Status indicator dot */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: nodeColor }}
          />
          <span
            className="font-[family-name:var(--font-nunito)] text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {group.label}
          </span>
        </div>
        <span
          className="font-[family-name:var(--font-dm-sans)] text-xs font-medium tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {formatCurrency(group.totalAmount)}
        </span>
      </div>

      {/* Expense List - Compact (vertical timeline) or Standard */}
      {compact && expensesByDate ? (
        <div className="relative ml-1">
          {/* Vertical timeline line */}
          <div
            className="absolute left-[3px] top-2 bottom-2 w-px"
            style={{ backgroundColor: "var(--border)" }}
          />

          {(() => {
            let compactDividerShown = false;
            const rows = Array.from(expensesByDate.entries()).map(([dateKey, dateExpenses], dateIndex) => {
            const date = new Date(dateKey);
            const dateStatus = dateExpenses.some(e => getExpenseStatus(e) === "overdue")
              ? "overdue"
              : dateExpenses.some(e => getExpenseStatus(e) === "due")
                ? "due"
                : "upcoming";

            // Show payday divider before date group that crosses the boundary (only in matching month)
            let showCompactDivider = false;
            if (payDateForGroup && !compactDividerShown && dateKey >= payDateForGroup) {
              showCompactDivider = true;
              compactDividerShown = true;
            }

            return (
              <div key={dateKey}>
              {showCompactDivider && payDateForGroup && (
                <PayDayDivider date={payDateForGroup} dueBeforePayCents={dueBeforePayCents} className="ml-3" />
              )}
              <div className="flex items-start gap-3 mb-2">
                {/* Timeline node */}
                <div
                  className="w-[7px] h-[7px] rounded-full mt-1.5 flex-shrink-0 z-10"
                  style={{
                    backgroundColor: dateStatus === "overdue"
                      ? "var(--pastel-coral)"
                      : dateStatus === "due"
                        ? "var(--pastel-yellow)"
                        : "var(--pastel-blue)",
                    border: "2px solid var(--card)"
                  }}
                />

                {/* Date + expenses */}
                <div className="flex-1 min-w-0">
                  {/* Date label */}
                  <div
                    className="text-[10px] font-semibold mb-0.5"
                    style={{
                      color: dateStatus === "overdue"
                        ? "var(--pastel-coral-dark)"
                        : dateStatus === "due"
                          ? "var(--pastel-yellow-dark)"
                          : "var(--text-tertiary)"
                    }}
                  >
                    {formatDateHeader(date)}
                  </div>

                  {/* Expense rows */}
                  {dateExpenses.map((expense) => (
                    <motion.div
                      key={`${expense.id}-${expense.occurrenceIndex}`}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group flex items-center gap-1.5 py-0.5 -ml-1 pl-1 pr-1 rounded transition-colors hover:bg-[var(--muted)]"
                    >
                      <button
                        onClick={() => onExpenseClick?.(expense)}
                        className="flex items-center gap-1.5 min-w-0 text-left"
                      >
                        <span className="text-xs flex-shrink-0">{expense.emoji}</span>
                        <span
                          className="font-[family-name:var(--font-dm-sans)] text-xs truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {expense.name}
                        </span>
                        {/* Multiplier chip */}
                        {expense.occurrenceCount > 1 && (
                          <span
                            className="font-[family-name:var(--font-dm-sans)] text-[9px] font-semibold px-1 py-0.5 rounded flex-shrink-0"
                            style={{
                              backgroundColor: "var(--pastel-blue-light)",
                              color: "var(--pastel-blue-dark)",
                            }}
                          >
                            ×{expense.occurrenceCount}
                          </span>
                        )}
                      </button>
                      {/* Edit button */}
                      {onEditExpense && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditExpense(expense.id);
                          }}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          title="Edit"
                        >
                          <Pencil className="h-2.5 w-2.5" style={{ color: "var(--text-tertiary)" }} />
                        </button>
                      )}
                      {/* Amount */}
                      <span
                        className="font-[family-name:var(--font-dm-sans)] text-xs font-medium tabular-nums flex-shrink-0 ml-auto"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {formatCurrency(expense.totalAmountCents)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
              </div>
            );
          });
            // If payday divider wasn't shown (all expenses before payday), show it at the end
            if (payDateForGroup && !compactDividerShown) {
              rows.push(
                <PayDayDivider key="payday-trailing" date={payDateForGroup} dueBeforePayCents={dueBeforePayCents} className="ml-3" />
              );
            }
            return rows;
          })()}
        </div>
      ) : (
        <div className="space-y-1">
          {(() => {
            let standardDividerShown = false;
            const rows = group.expenses.map((expense, index) => {
            const status = getExpenseStatus(expense);
            const dateKey = expense.projectedDate.toISOString().split('T')[0];

            // Show payday divider before first expense that crosses the boundary (only in matching month)
            let showStandardDivider = false;
            if (payDateForGroup && !standardDividerShown && dateKey >= payDateForGroup) {
              showStandardDivider = true;
              standardDividerShown = true;
            }

            return (
              <div key={`${expense.id}-${expense.occurrenceIndex}`}>
              {showStandardDivider && payDateForGroup && (
                <PayDayDivider date={payDateForGroup} dueBeforePayCents={dueBeforePayCents} />
              )}
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="group flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all hover:bg-[var(--muted)]"
              >
                {/* Left section: Name + chip + edit */}
                <button
                  onClick={() => onExpenseClick?.(expense)}
                  className="flex items-center gap-2 min-w-0 text-left"
                >
                  {/* Emoji */}
                  <span className="text-base flex-shrink-0">{expense.emoji}</span>

                  {/* Name */}
                  <span
                    className="font-[family-name:var(--font-dm-sans)] text-[13px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {expense.name}
                  </span>

                  {/* Multiplier chip */}
                  {expense.occurrenceCount > 1 && (
                    <span
                      className="font-[family-name:var(--font-dm-sans)] text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{
                        backgroundColor: "var(--pastel-blue-light)",
                        color: "var(--pastel-blue-dark)",
                      }}
                    >
                      ×{expense.occurrenceCount}
                    </span>
                  )}
                </button>

                {/* Edit button */}
                {onEditExpense && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditExpense(expense.id);
                    }}
                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="Edit expense"
                  >
                    <Pencil
                      className="h-3 w-3"
                      style={{ color: "var(--text-tertiary)" }}
                    />
                  </button>
                )}

                {/* Right-aligned columns */}
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                  {/* Amount */}
                  <span
                    className="font-[family-name:var(--font-dm-sans)] text-[13px] font-semibold tabular-nums text-right min-w-[50px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatCurrency(expense.totalAmountCents)}
                  </span>

                  {/* Date badge */}
                  <span
                    className="font-[family-name:var(--font-dm-sans)] text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap text-center min-w-[44px]"
                    style={{
                      backgroundColor:
                        status === "overdue"
                          ? "var(--pastel-coral-light)"
                          : status === "due"
                          ? "var(--pastel-yellow-light)"
                          : "var(--pastel-blue-light)",
                      color:
                        status === "overdue"
                          ? "var(--pastel-coral-dark)"
                          : status === "due"
                          ? "var(--pastel-yellow-dark)"
                          : "var(--pastel-blue-dark)",
                    }}
                  >
                    {formatRelativeDate(expense.projectedDate)}
                  </span>
                </div>
              </motion.div>
              </div>
            );
          });
            // If payday divider wasn't shown (all expenses before payday), show it at the end
            if (payDateForGroup && !standardDividerShown) {
              rows.push(
                <PayDayDivider key="payday-trailing" date={payDateForGroup} dueBeforePayCents={dueBeforePayCents} />
              );
            }
            return rows;
          })()}
        </div>
      )}
    </motion.div>
  );
}
