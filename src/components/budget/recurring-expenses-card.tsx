"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock, Plus } from "lucide-react";

interface ExpenseData {
  id: string;
  name: string;
  emoji: string | null;
  expected_amount_cents: number;
  next_due_date: string;
  recurrence_type?: string;
  expense_matches?: any[];
  original_amount_cents?: number;
  split_percentage?: number;
}

interface RecurringExpensesCardProps {
  expenses: ExpenseData[];
  periodStart?: Date;
  periodEnd?: Date;
  onEditExpense?: (expense: ExpenseData) => void;
  onAddExpense?: () => void;
  children?: React.ReactNode;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
  });

function getExpenseStatus(
  expense: ExpenseData,
  periodStart?: Date,
  periodEnd?: Date
): "paid" | "overdue" | "upcoming" {
  const now = new Date();

  // Check if paid in current period
  if (periodStart && periodEnd && expense.expense_matches?.length) {
    const isPaidInPeriod = expense.expense_matches.some((m: any) => {
      const txn = m.transactions;
      const txnDate = txn?.settled_at || txn?.created_at || m.matched_at;
      if (!txnDate) return false;
      const d = new Date(txnDate);
      return d >= periodStart && d <= periodEnd;
    });
    if (isPaidInPeriod) return "paid";
  }

  const dueDate = new Date(expense.next_due_date);
  if (dueDate < now) return "overdue";
  return "upcoming";
}

const statusConfig = {
  paid: {
    icon: CheckCircle2,
    color: "var(--pastel-mint-dark)",
    bg: "var(--pastel-mint-light)",
    label: "Paid",
  },
  overdue: {
    icon: AlertCircle,
    color: "var(--pastel-coral-dark)",
    bg: "var(--pastel-coral-light)",
    label: "Overdue",
  },
  upcoming: {
    icon: Clock,
    color: "var(--pastel-blue-dark)",
    bg: "var(--pastel-blue-light)",
    label: "Upcoming",
  },
};

export function RecurringExpensesCard({
  expenses,
  periodStart,
  periodEnd,
  onEditExpense,
  onAddExpense,
  children,
}: RecurringExpensesCardProps) {
  if (expenses.length === 0) {
    return (
      <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Recurring Expenses
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-4 space-y-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No recurring expenses yet
          </p>
          {onAddExpense && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddExpense}
              className="h-8 text-xs font-medium rounded-lg cursor-pointer"
              style={{ color: "var(--pastel-blue-dark)" }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Expense
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Calculate monthly range by simulating occurrences across 12 months
  const monthlyRange = (() => {
    const now = new Date();
    const monthTotals: number[] = [];

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
      const daysInMonth = monthEnd.getDate();
      let total = 0;

      for (const e of expenses) {
        const amt = e.expected_amount_cents;
        const type = e.recurrence_type || "monthly";
        switch (type) {
          case "weekly":
            // Count Mondays (or any weekday) — simpler: days / 7
            total += amt * Math.floor(daysInMonth / 7);
            // Add 1 if remainder days include at least one occurrence
            if (daysInMonth % 7 > 0) total += amt;
            break;
          case "fortnightly":
            total += amt * Math.floor(daysInMonth / 14);
            if (daysInMonth % 14 >= 7) total += amt;
            break;
          case "monthly":
            total += amt;
            break;
          case "quarterly": {
            const mIdx = monthStart.getMonth();
            // Quarterly hits roughly every 3 months — check if this month aligns
            const dueMonth = e.next_due_date ? new Date(e.next_due_date).getMonth() : 0;
            if ((mIdx - dueMonth + 12) % 3 === 0) total += amt;
            break;
          }
          case "yearly": {
            const dueM = e.next_due_date ? new Date(e.next_due_date).getMonth() : 0;
            if (monthStart.getMonth() === dueM) total += amt;
            break;
          }
          // one-time: skip
        }
      }
      monthTotals.push(total);
    }

    const min = Math.min(...monthTotals);
    const max = Math.max(...monthTotals);
    return { min, max };
  })();

  // Sort: overdue first, then by next_due_date ascending
  const sorted = [...expenses].sort((a, b) => {
    const statusA = getExpenseStatus(a, periodStart, periodEnd);
    const statusB = getExpenseStatus(b, periodStart, periodEnd);
    const order = { overdue: 0, upcoming: 1, paid: 2 };
    if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
    return new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime();
  });

  return (
    <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Recurring Expenses
          </CardTitle>
          <Badge
            variant="secondary"
            className="text-[10px] font-bold px-1.5 py-0"
          >
            {expenses.length}
          </Badge>
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
          {monthlyRange.min === monthlyRange.max
            ? `${formatCurrency(monthlyRange.min)}/mo`
            : `${formatCurrency(monthlyRange.min)}-${formatCurrency(monthlyRange.max)}/mo`}
        </span>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {sorted.map((expense) => {
          const status = getExpenseStatus(expense, periodStart, periodEnd);
          const config = statusConfig[status];
          const StatusIcon = config.icon;

          return (
            <div
              key={expense.id}
              role={onEditExpense ? "button" : undefined}
              tabIndex={onEditExpense ? 0 : undefined}
              onClick={() => {
                // Restore original amount for the edit modal
                const editExpense = expense.original_amount_cents
                  ? { ...expense, expected_amount_cents: expense.original_amount_cents }
                  : expense;
                onEditExpense?.(editExpense);
              }}
              onKeyDown={(e) => {
                if (onEditExpense && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  const editExpense = expense.original_amount_cents
                    ? { ...expense, expected_amount_cents: expense.original_amount_cents }
                    : expense;
                  onEditExpense(editExpense);
                }
              }}
              className={`flex items-center gap-2.5 p-2 rounded-lg${onEditExpense ? " cursor-pointer hover:bg-[var(--surface-sunken)] transition-colors" : ""}`}
              style={{ backgroundColor: "var(--surface)" }}
            >
              <span className="text-lg flex-shrink-0">{expense.emoji || "📋"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {expense.name}
                  </p>
                  {expense.split_percentage && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0 rounded-full flex-shrink-0"
                      style={{ backgroundColor: "var(--pastel-blue-light)", color: "var(--pastel-blue-dark)" }}
                    >
                      {expense.split_percentage}%
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {status === "paid" ? "Paid" : formatDate(expense.next_due_date)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatCurrency(expense.expected_amount_cents)}
                </span>
                <StatusIcon
                  className="h-4 w-4"
                  style={{ color: config.color }}
                />
              </div>
            </div>
          );
        })}
        {onAddExpense && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddExpense}
            className="w-full mt-2 h-8 text-xs font-medium rounded-lg cursor-pointer"
            style={{ color: "var(--pastel-blue-dark)" }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Expense
          </Button>
        )}
      </CardContent>
      {children}
    </Card>
  );
}
