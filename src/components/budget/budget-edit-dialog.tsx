"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/budget-zero-calculations";
import type { BudgetRow } from "@/lib/budget-row-types";
import { isSubcategoryRow, isCategoryRow } from "@/lib/budget-row-types";

type BudgetPeriod = 'weekly' | 'fortnightly' | 'monthly';

interface ExpenseData {
  id: string;
  name: string;
  category_name: string;
  expected_amount_cents: number;
  recurrence_type: string;
  next_due_date: string;
  emoji: string;
  is_matched?: boolean;
}

interface BudgetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: BudgetRow | null;
  expenses: ExpenseData[];
  budgetPeriod?: BudgetPeriod;
  onSave: (item: BudgetRow, amountCents: number) => Promise<void>;
  onMethodologyAssignmentRequest?: (
    categoryName: string,
    amount: number,
    underlyingCategories: string[]
  ) => void;
}

function getFrequencyLabel(recurrence: string): string {
  switch (recurrence) {
    case "weekly": return "/wk";
    case "fortnightly": return "/fn";
    case "monthly": return "/mo";
    case "quarterly": return "/qtr";
    case "yearly": return "/yr";
    default: return "";
  }
}

function getPeriodLabel(period: BudgetPeriod): string {
  switch (period) {
    case "weekly": return "Weekly";
    case "fortnightly": return "Fortnightly";
    case "monthly": return "Monthly";
  }
}

/** Convert an expense amount to the target budget period via monthly intermediate */
function convertToPeriod(amountCents: number, recurrence: string, targetPeriod: BudgetPeriod): number {
  // First normalize to monthly
  let monthly: number;
  switch (recurrence) {
    case "weekly": monthly = amountCents * 4; break;
    case "fortnightly": monthly = amountCents * 2; break;
    case "monthly": monthly = amountCents; break;
    case "quarterly": monthly = Math.round(amountCents / 3); break;
    case "yearly": monthly = Math.round(amountCents / 12); break;
    default: monthly = amountCents;
  }
  // Then convert to target period
  switch (targetPeriod) {
    case "weekly": return Math.round(monthly / 4);
    case "fortnightly": return Math.round(monthly / 2);
    case "monthly": return monthly;
  }
}

export function BudgetEditDialog({
  open,
  onOpenChange,
  item,
  expenses,
  budgetPeriod = 'monthly',
  onSave,
  onMethodologyAssignmentRequest,
}: BudgetEditDialogProps) {
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter expenses for this item — only match by inferred subcategory
  const itemExpenses = expenses.filter((e: any) => {
    if (!item) return false;
    if (item.type === "subcategory" && item.parentCategory) {
      return e.inferred_subcategory === item.name &&
        (e.inferred_parent_category || e.category_name) === item.parentCategory;
    }
    return false;
  });

  // Compute split-adjusted auto total using the engine's pre-calculated amount
  const rawAutoTotal = itemExpenses.reduce(
    (sum, e) => sum + convertToPeriod(e.expected_amount_cents, e.recurrence_type, budgetPeriod),
    0
  );
  const isSubItem = item && isSubcategoryRow(item);
  const engineAutoTotal = isSubItem && 'expenseBudgetedCents' in item && item.expenseBudgetedCents
    ? item.expenseBudgetedCents : undefined;
  // If the engine computed a split-adjusted amount, use it and scale per-expense amounts
  const splitRatio = engineAutoTotal != null && rawAutoTotal > 0 ? engineAutoTotal / rawAutoTotal : 1;
  const autoTotal = engineAutoTotal ?? rawAutoTotal;

  useEffect(() => {
    if (open && item) {
      setEditValue((item.assigned / 100).toFixed(0));
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, item]);

  const handleSave = async () => {
    if (!item) return;
    const amount = parseFloat(editValue);
    if (isNaN(amount) || amount < 0) return;

    const amountCents = Math.round(amount * 100);

    if (
      item.type === "category" &&
      item.underlyingCategories &&
      item.underlyingCategories.length > 1
    ) {
      onMethodologyAssignmentRequest?.(
        item.name,
        amountCents,
        item.underlyingCategories
      );
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(item, amountCents);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  const handleUseAuto = () => {
    setEditValue((autoTotal / 100).toFixed(0));
  };

  if (!item) return null;

  const periodLabel = getPeriodLabel(budgetPeriod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
        <div
          className="p-5"
          style={{ backgroundColor: "var(--card)" }}
        >
          {/* Header */}
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <DialogTitle className="font-[family-name:var(--font-nunito)] font-bold text-lg">
                  {item.name}
                </DialogTitle>
                {isSubcategoryRow(item) && item.parentCategory && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {item.parentCategory}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Amount Input */}
          <div className="space-y-4">
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-tertiary)" }}
              >
                {periodLabel} Budget
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  $
                </span>
                <Input
                  ref={inputRef}
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={saving}
                  className="h-12 pl-8 text-xl font-[family-name:var(--font-nunito)] font-bold text-center rounded-xl"
                  style={{ fontSize: "1.25rem" }}
                />
              </div>
            </div>

            {/* Auto Calculation Breakdown */}
            {itemExpenses.length > 0 && (
              <div
                className="rounded-xl p-3 space-y-2"
                style={{
                  backgroundColor: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles
                    className="h-3.5 w-3.5"
                    style={{ color: "var(--text-tertiary)" }}
                  />
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Auto-calculated from expenses
                  </span>
                </div>

                {itemExpenses.map((expense) => {
                  const periodAmount = Math.round(convertToPeriod(
                    expense.expected_amount_cents,
                    expense.recurrence_type,
                    budgetPeriod
                  ) * splitRatio);
                  return (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{expense.emoji}</span>
                        <span
                          className="text-sm font-[family-name:var(--font-dm-sans)]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {expense.name}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {formatCurrency(expense.expected_amount_cents)}
                          {getFrequencyLabel(expense.recurrence_type)}
                        </span>
                      </div>
                      <span
                        className="text-sm font-[family-name:var(--font-nunito)] font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {formatCurrency(periodAmount)}
                      </span>
                    </div>
                  );
                })}

                {/* Total */}
                <div
                  className="flex items-center justify-between pt-2 mt-1 border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {periodLabel} Total
                  </span>
                  <span
                    className="text-sm font-[family-name:var(--font-nunito)] font-bold"
                    style={{ color: "var(--accent-teal)" }}
                  >
                    {formatCurrency(autoTotal)}
                  </span>
                </div>

                {/* Use Auto button */}
                {Math.round(parseFloat(editValue || "0") * 100) !== autoTotal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUseAuto}
                    className="w-full mt-1 rounded-lg text-xs gap-1.5"
                    style={{
                      borderColor: "var(--pastel-mint)",
                      color: "var(--pastel-mint-dark)",
                    }}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Use auto amount ({formatCurrency(autoTotal)})
                  </Button>
                )}
              </div>
            )}

            {/* Currently spending indicator */}
            {item.spent > 0 && (
              <div
                className="flex items-center justify-between text-xs px-1"
                style={{ color: "var(--text-tertiary)" }}
              >
                <span>Spent this period</span>
                <span className="font-semibold">{formatCurrency(item.spent)}</span>
              </div>
            )}

            {/* Save Button */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 rounded-xl font-[family-name:var(--font-nunito)] font-bold"
              style={{
                backgroundColor: "var(--brand-coral)",
                color: "white",
              }}
            >
              {saving ? "Saving..." : "Save Budget"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
