"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { getSubcategoriesForParents } from "@/lib/budget-templates";
import type { WizardState } from "../budget-create-wizard";

interface WizardReviewStepProps {
  state: WizardState;
  onCreate: () => void;
  isCreating: boolean;
}

const methodologyLabels: Record<string, string> = {
  "zero-based": "Zero-Based",
  "50-30-20": "50 / 30 / 20",
  envelope: "Envelope",
  "pay-yourself-first": "Pay Yourself First",
  "80-20": "80 / 20",
};

const periodLabels: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

const typeLabels: Record<string, string> = {
  personal: "Personal",
  household: "Household",
  custom: "Custom",
};

const viewLabels: Record<string, string> = {
  individual: "Individual (My Share)",
  shared: "Shared (Our Budget)",
};

const carryoverLabels: Record<string, string> = {
  none: "Fresh each period",
};

export function WizardReviewStep({
  state,
  onCreate,
  isCreating,
}: WizardReviewStepProps) {
  const categoryCount =
    state.includedCategories.length > 0
      ? getSubcategoriesForParents(state.includedCategories).length
      : 41; // All subcategories across 11 parent categories

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const summaryItems = [
    { label: "Name", value: `${state.emoji} ${state.name || "My Budget"}` },
    { label: "Type", value: typeLabels[state.budgetType] },
    {
      label: "Method",
      value: methodologyLabels[state.methodology] ?? state.methodology,
    },
    { label: "Period", value: periodLabels[state.periodType] },
    {
      label: "Carryover",
      value: "Fresh each period",
    },
    {
      label: "View",
      value: viewLabels[state.budgetView],
      show: state.budgetType === "household",
    },
    {
      label: "Total Budget",
      value: state.totalBudget ? formatCurrency(state.totalBudget) : "Not set",
      show: state.budgetType === "custom",
    },
    {
      label: "Dates",
      value:
        state.startDate && state.endDate
          ? `${formatDate(state.startDate)} — ${formatDate(state.endDate)}`
          : state.startDate
            ? `From ${formatDate(state.startDate)}`
            : state.endDate
              ? `Until ${formatDate(state.endDate)}`
              : "Open-ended",
      show: state.budgetType === "custom",
    },
    { label: "Categories", value: `${categoryCount} included` },
    {
      label: "Template",
      value: state.template?.name ?? "From Scratch",
    },
  ].filter((item) => item.show !== false);

  return (
    <div>
      <h2
        className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-bold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Review Your Budget
      </h2>
      <p
        className="text-base mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Everything look right? You can always change these settings later.
      </p>

      {/* Summary card */}
      <div
        className="rounded-2xl border overflow-hidden mb-6"
        style={{
          backgroundColor: "var(--surface-elevated)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header with emoji + name */}
        <div
          className="px-5 py-4 border-b flex items-center gap-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-3xl" aria-hidden="true">
            {state.emoji}
          </span>
          <div>
            <h3
              className="font-[family-name:var(--font-nunito)] font-bold text-lg"
              style={{ color: "var(--text-primary)" }}
            >
              {state.name || "My Budget"}
            </h3>
            <span
              className="text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              {typeLabels[state.budgetType]} &middot;{" "}
              {methodologyLabels[state.methodology]}
            </span>
          </div>
        </div>

        {/* Detail rows */}
        {summaryItems.map((item, i) => (
          <div
            key={item.label}
            className="flex items-center justify-between px-5 py-3"
            style={{
              borderBottom:
                i < summaryItems.length - 1
                  ? "1px solid var(--border)"
                  : undefined,
            }}
          >
            <span
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              {item.label}
            </span>
            <span
              className="text-sm font-[family-name:var(--font-nunito)] font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* Create button */}
      <Button
        onClick={onCreate}
        disabled={isCreating}
        size="lg"
        className="w-full rounded-xl h-12 text-base font-[family-name:var(--font-nunito)] font-bold cursor-pointer"
        style={{
          backgroundColor: "var(--brand-coral)",
          color: "white",
        }}
      >
        {isCreating ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
            Creating&hellip;
          </>
        ) : (
          <>
            <Check className="w-5 h-5 mr-2" aria-hidden="true" />
            Create Budget
          </>
        )}
      </Button>

      <p
        className="text-xs text-center mt-4"
        style={{ color: "var(--text-tertiary)" }}
      >
        You can change any of these settings after creation.
      </p>
    </div>
  );
}
