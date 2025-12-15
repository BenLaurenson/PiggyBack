"use client";

import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Home,
  PieChart,
  Rocket,
  Palmtree,
  LayoutGrid,
  Check,
  DollarSign,
  Calendar,
} from "lucide-react";
import {
  BUDGET_TEMPLATES,
  getSubcategoriesForParents,
  type BudgetTemplate,
} from "@/lib/budget-templates";
import type { WizardState } from "../budget-create-wizard";
import type { LucideIcon } from "lucide-react";

interface WizardTemplateStepProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  initialTemplate: string | null;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  PieChart,
  Rocket,
  Palmtree,
};

const TEMPLATE_COLORS: Record<string, string> = {
  "essentials-only": "var(--pastel-blue-dark, #60A5FA)",
  "50-30-20": "var(--pastel-coral-dark, #F87171)",
  "savings-powerhouse": "var(--pastel-yellow-dark, #FBBF24)",
  "event-fund": "var(--pastel-blue-dark, #60A5FA)",
};

const METHODOLOGY_LABELS: Record<string, string> = {
  "zero-based": "Zero-Based",
  "50-30-20": "50 / 30 / 20",
  "pay-yourself-first": "Pay Yourself First",
  envelope: "Envelope",
  "80-20": "80 / 20",
};


export function WizardTemplateStep({
  state,
  onUpdate,
  onNext,
  initialTemplate,
}: WizardTemplateStepProps) {
  // Auto-select template from URL param
  useEffect(() => {
    if (initialTemplate && !state.template) {
      const found = BUDGET_TEMPLATES.find((t) => t.id === initialTemplate);
      if (found) {
        onUpdate({
          template: found,
          methodology: found.methodology,
          periodType: found.periodType,
          includedCategories: [...found.includedCategories],
        });
      }
    }
  }, [initialTemplate, state.template, onUpdate]);

  // Handle template selection
  const handleSelectTemplate = useCallback(
    (template: BudgetTemplate | null) => {
      if (template) {
        onUpdate({
          template,
          methodology: template.methodology,
          periodType: template.periodType,
          includedCategories: [...template.includedCategories],
          sections: [],
        });
      } else {
        onUpdate({
          template: null,
          methodology: "zero-based",
          periodType: "monthly",
          includedCategories: [],
          sections: [],
        });
      }
    },
    [onUpdate]
  );

  return (
    <div>
      <h2
        className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-bold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Choose Your Approach
      </h2>
      <p
        className="text-base mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Pick a starting point that matches your style, or start from scratch.
      </p>

      {/* Template cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {BUDGET_TEMPLATES.map((template) => {
          const isSelected = state.template?.id === template.id;
          const Icon = ICON_MAP[template.icon] ?? LayoutGrid;
          const accentColor =
            TEMPLATE_COLORS[template.id] ?? "var(--text-primary)";

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => handleSelectTemplate(template)}
              className="rounded-2xl p-5 text-left border-2 cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-2 relative"
              style={{
                backgroundColor: isSelected
                  ? `color-mix(in srgb, ${accentColor} 8%, var(--surface-elevated))`
                  : "var(--surface-elevated)",
                borderColor: isSelected ? accentColor : "var(--border)",
              }}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <div
                  className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: accentColor }}
                >
                  <Check
                    className="w-3.5 h-3.5 text-white"
                    aria-hidden="true"
                  />
                </div>
              )}

              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{
                  backgroundColor: isSelected ? accentColor : "var(--muted)",
                }}
              >
                <Icon
                  className="w-5 h-5"
                  style={{
                    color: isSelected ? "white" : "var(--text-secondary)",
                  }}
                  aria-hidden="true"
                />
              </div>

              <h3
                className="font-[family-name:var(--font-nunito)] font-bold text-sm mb-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                {template.name}
              </h3>
              <p
                className="text-xs mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                {template.description}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {/* Methodology badge — prominent */}
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{
                    color: accentColor,
                    backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
                  }}
                >
                  {METHODOLOGY_LABELS[template.methodology] ??
                    template.methodology}
                </span>
                {/* Other feature tags */}
                {template.features
                  .filter(
                    (f) =>
                      !f.toLowerCase().includes("methodology") &&
                      !f.toLowerCase().includes("zero-based")
                  )
                  .map((feature) => (
                    <span
                      key={feature}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        color: "var(--text-secondary)",
                        backgroundColor: "var(--muted)",
                      }}
                    >
                      {feature}
                    </span>
                  ))}
              </div>
            </button>
          );
        })}

        {/* Start from scratch */}
        <button
          type="button"
          onClick={() => handleSelectTemplate(null)}
          className="rounded-2xl p-5 text-left border-2 border-dashed cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-2 relative"
          style={{
            backgroundColor:
              state.template === null
                ? "var(--surface-elevated)"
                : "transparent",
            borderColor:
              state.template === null
                ? "var(--brand-coral)"
                : "var(--border)",
          }}
          aria-pressed={state.template === null}
        >
          {state.template === null && (
            <div
              className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--brand-coral)" }}
            >
              <Check
                className="w-3.5 h-3.5 text-white"
                aria-hidden="true"
              />
            </div>
          )}

          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{
              backgroundColor:
                state.template === null
                  ? "var(--brand-coral)"
                  : "var(--muted)",
            }}
          >
            <LayoutGrid
              className="w-5 h-5"
              style={{
                color:
                  state.template === null
                    ? "white"
                    : "var(--text-secondary)",
              }}
              aria-hidden="true"
            />
          </div>

          <h3
            className="font-[family-name:var(--font-nunito)] font-bold text-sm mb-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            Start from Scratch
          </h3>
          <p
            className="text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Build your own budget with all categories
          </p>
        </button>
      </div>

      {/* Template description when selected */}
      {state.template && (
        <div
          className="rounded-2xl p-4 border mb-6"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            {state.template.longDescription}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                color: TEMPLATE_COLORS[state.template.id],
                backgroundColor: `color-mix(in srgb, ${TEMPLATE_COLORS[state.template.id]} 12%, transparent)`,
              }}
            >
              {METHODOLOGY_LABELS[state.template.methodology] ??
                state.template.methodology}
            </span>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                color: "var(--text-secondary)",
                backgroundColor: "var(--muted)",
              }}
            >
              {getSubcategoriesForParents(state.template.includedCategories).length} categories
            </span>
          </div>
        </div>
      )}

      {/* Custom budget: total amount + date range */}
      {state.budgetType === "custom" && (
        <div
          className="mb-6 rounded-2xl border p-5 space-y-5"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <DollarSign
              className="w-4 h-4"
              style={{ color: "var(--pastel-yellow-dark, #FBBF24)" }}
              aria-hidden="true"
            />
            <span
              className="text-sm font-[family-name:var(--font-nunito)] font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Budget Amount &amp; Duration
            </span>
          </div>
          <p
            className="text-xs mb-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            Set a total budget and optional date range for this custom budget.
          </p>

          {/* Total budget amount */}
          <div>
            <Label
              htmlFor="total-budget"
              className="text-sm font-medium mb-2 block"
              style={{ color: "var(--text-primary)" }}
            >
              Total Budget
            </Label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                $
              </span>
              <Input
                id="total-budget"
                type="number"
                min={0}
                step={100}
                placeholder="e.g. 5000"
                value={state.totalBudget ?? ""}
                onChange={(e) =>
                  onUpdate({
                    totalBudget: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  })
                }
                className="h-11 rounded-xl pl-7"
              />
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="start-date"
                className="text-sm font-medium mb-2 block"
                style={{ color: "var(--text-primary)" }}
              >
                Start Date
              </Label>
              <div className="relative">
                <Calendar
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: "var(--text-tertiary)" }}
                  aria-hidden="true"
                />
                <Input
                  id="start-date"
                  type="date"
                  value={state.startDate ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      startDate: e.target.value || null,
                    })
                  }
                  className="h-11 rounded-xl pl-9"
                />
              </div>
            </div>
            <div>
              <Label
                htmlFor="end-date"
                className="text-sm font-medium mb-2 block"
                style={{ color: "var(--text-primary)" }}
              >
                End Date
              </Label>
              <div className="relative">
                <Calendar
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: "var(--text-tertiary)" }}
                  aria-hidden="true"
                />
                <Input
                  id="end-date"
                  type="date"
                  value={state.endDate ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      endDate: e.target.value || null,
                    })
                  }
                  className="h-11 rounded-xl pl-9"
                  min={state.startDate ?? undefined}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Continue */}
      <Button
        onClick={onNext}
        size="lg"
        className="w-full rounded-xl h-12 text-base font-[family-name:var(--font-nunito)] font-bold cursor-pointer"
        style={{
          backgroundColor: "var(--brand-coral)",
          color: "white",
        }}
      >
        Continue
      </Button>
    </div>
  );
}
