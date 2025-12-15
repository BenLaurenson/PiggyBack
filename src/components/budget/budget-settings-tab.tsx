"use client";

/**
 * Budget Settings Tab
 *
 * Period type, layout customization, and delete budget.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { UserBudget } from "@/app/actions/budgets";
import { deleteBudget } from "@/app/actions/budgets";
import { BudgetLayoutProvider } from "@/contexts/budget-layout-context";
import { BudgetCategoryLayoutEditor } from "./budget-category-layout-editor";
import type { BudgetItemWithLayout } from "@/types/budget-layout";
import { goeyToast as toast } from "goey-toast";
import { useBudget } from "@/contexts/budget-context";

const PERIOD_OPTIONS = [
  {
    value: "weekly" as const,
    label: "Weekly",
    description: "Budget resets every week",
  },
  {
    value: "fortnightly" as const,
    label: "Fortnightly",
    description: "Budget resets every two weeks",
  },
  {
    value: "monthly" as const,
    label: "Monthly",
    description: "Budget resets every month",
  },
];

interface BudgetSettingsTabProps {
  budget: UserBudget;
  partnershipId?: string;
  allItems?: BudgetItemWithLayout[];
  userId?: string;
  layoutConfig?: any;
  onLayoutSaved?: () => void;
}

export function BudgetSettingsTab({
  budget,
  partnershipId,
  allItems,
  userId,
  layoutConfig,
  onLayoutSaved,
}: BudgetSettingsTabProps) {
  const router = useRouter();
  const { updateSettings } = useBudget();
  const hasLayoutProps = partnershipId && userId && allItems;
  const [periodType, setPeriodType] = useState(budget.period_type || "monthly");
  const [isPending, startTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handlePeriodChange = (period: "weekly" | "fortnightly" | "monthly") => {
    setPeriodType(period);
    startTransition(async () => {
      try {
        await updateSettings({ period_type: period });
        toast.success("Budget period updated");
      } catch {
        toast.error("Failed to update budget period");
        setPeriodType(budget.period_type || "monthly");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteBudget(budget.id);
      if (result.error) {
        toast.error("Failed to delete budget");
        setShowDeleteConfirm(false);
      } else {
        toast.success("Budget deleted");
        router.push("/budget");
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Budget Period */}
      <div className="grid grid-cols-1 gap-4">
        {/* Budget Period */}
        <div
          className="rounded-2xl shadow-sm border overflow-hidden"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="px-5 py-3.5 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="font-[family-name:var(--font-nunito)] text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Budget Period
            </span>
          </div>

          <div className="p-4 space-y-1.5">
            {PERIOD_OPTIONS.map((opt) => {
              const isSelected = periodType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handlePeriodChange(opt.value)}
                  disabled={isPending}
                  className="w-full rounded-xl px-3.5 py-2.5 text-left border cursor-pointer transition-colors duration-200 flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-2 disabled:opacity-50"
                  style={{
                    backgroundColor: isSelected
                      ? "var(--pastel-coral-light, rgba(248,113,113,0.08))"
                      : "var(--surface-elevated)",
                    borderColor: isSelected
                      ? "var(--brand-coral)"
                      : "var(--border)",
                  }}
                  aria-pressed={isSelected}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center"
                    style={{
                      borderColor: isSelected
                        ? "var(--brand-coral)"
                        : "var(--text-tertiary)",
                    }}
                  >
                    {isSelected && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: "var(--brand-coral)" }}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span
                      className="text-sm font-[family-name:var(--font-nunito)] font-bold block"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {opt.label}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {opt.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Customize Layout - inline editor */}
      {hasLayoutProps && (
        <div
          className="rounded-2xl shadow-sm border overflow-hidden"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="px-5 py-3.5 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="font-[family-name:var(--font-nunito)] text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Customize Layout
            </span>
          </div>

          <div className="p-5">
            <BudgetLayoutProvider
              partnershipId={partnershipId}
              userId={userId}
              budgetId={budget.id}
              initialLayoutConfig={layoutConfig}
              budgetView={budget.budget_view === 'shared' ? 'shared' : 'individual'}
              onLayoutSaved={onLayoutSaved}
            >
              <BudgetCategoryLayoutEditor allItems={allItems} />
            </BudgetLayoutProvider>
          </div>
        </div>
      )}

      {/* Danger Zone — Delete Budget */}
      <div
        className="rounded-2xl shadow-sm border overflow-hidden"
        style={{
          backgroundColor: "var(--surface-elevated)",
          borderColor: "var(--pastel-coral-dark, #F87171)",
        }}
      >
        <div
          className="px-5 py-3.5 border-b"
          style={{ borderColor: "var(--pastel-coral-dark, #F87171)" }}
        >
          <span
            className="font-[family-name:var(--font-nunito)] text-base font-bold"
            style={{ color: "var(--pastel-coral-dark)" }}
          >
            Danger Zone
          </span>
        </div>

        <div className="p-5">
          {!showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="text-sm font-[family-name:var(--font-nunito)] font-bold block"
                  style={{ color: "var(--text-primary)" }}
                >
                  Delete this budget
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  This will remove the budget and all its assignments.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="shrink-0 cursor-pointer"
                style={{
                  borderColor: "var(--pastel-coral-dark)",
                  color: "var(--pastel-coral-dark)",
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                Are you sure you want to delete <strong>{budget.emoji} {budget.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isPending}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="cursor-pointer"
                  style={{
                    backgroundColor: "var(--pastel-coral-dark)",
                    color: "white",
                  }}
                >
                  {isPending ? "Deleting..." : "Yes, Delete Budget"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
