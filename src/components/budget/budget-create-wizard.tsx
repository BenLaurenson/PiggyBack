"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { WizardWelcomeStep } from "./wizard/wizard-welcome-step";
import { WizardPrerequisitesStep } from "./wizard/wizard-prerequisites-step";
import { WizardTemplateStep } from "./wizard/wizard-template-step";
import { WizardFinetuneStep } from "./wizard/wizard-finetune-step";
import { WizardReviewStep } from "./wizard/wizard-review-step";
import { goeyToast as toast } from "goey-toast";
import { createBudget, type CreateBudgetInput } from "@/app/actions/budgets";
import type { BudgetTemplate } from "@/lib/budget-templates";
import type { Section } from "@/lib/layout-persistence";

export interface WizardPrerequisites {
  hasSalary: boolean;
  hasPartnerIncome: boolean;
  hasBankConnection: boolean;
  expenseCount: number;
  goalCount: number;
  investmentCount: number;
  hasPartner: boolean;
  hasExistingBudgetData: boolean;
  goals: { id: string; name: string }[];
  investments: { id: string; name: string }[];
}

export interface WizardState {
  name: string;
  emoji: string;
  budgetType: "personal" | "household" | "custom";
  template: BudgetTemplate | null;
  methodology: string;
  periodType: "weekly" | "fortnightly" | "monthly";
  budgetView: "individual" | "shared";
  includedCategories: string[];
  sections: Section[];
  hiddenItemIds: string[];
  /** Custom budgets: total budget amount (replaces salary-derived calculation) */
  totalBudget: number | null;
  /** Custom budgets: fixed start date */
  startDate: string | null;
  /** Custom budgets: fixed end date */
  endDate: string | null;
  /** How unspent money carries over between periods */
  carryoverMode: "none";
}

const STEP_COUNT = 5;
const STEP_LABELS = [
  "Name & Type",
  "Prerequisites",
  "Approach",
  "Fine-tune",
  "Review",
];

interface BudgetCreateWizardProps {
  partnershipId: string;
  prerequisites: WizardPrerequisites;
  initialTemplate: string | null;
}

export function BudgetCreateWizard({
  partnershipId,
  prerequisites,
  initialTemplate,
}: BudgetCreateWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back

  const [state, setState] = useState<WizardState>({
    name: "",
    emoji: "💰",
    budgetType: "personal",
    template: null,
    methodology: "zero-based",
    periodType: "monthly",
    budgetView: "individual",
    includedCategories: [],
    sections: [],
    hiddenItemIds: [],
    totalBudget: null,
    startDate: null,
    endDate: null,
    carryoverMode: "none",
  });

  const updateState = useCallback(
    (updates: Partial<WizardState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const goNext = useCallback(() => {
    if (currentStep < STEP_COUNT - 1) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback(
    (step: number) => {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    },
    [currentStep]
  );

  const handleCreate = useCallback(async () => {
    // Timeout protection: If creation takes > 10s, show warning
    const timeout = setTimeout(() => {
      toast.warning("This is taking longer than expected...");
    }, 10000);

    try {
      setIsCreating(true);

      const input: CreateBudgetInput = {
        partnership_id: partnershipId,
        name: state.name || "My Budget",
        emoji: state.emoji,
        budget_type: state.budgetType,
        methodology: state.methodology,
        budget_view: state.budgetView,
        period_type: state.periodType,
        template_source: state.template?.id ?? undefined,
        category_filter:
          state.includedCategories.length > 0
            ? { included: state.includedCategories }
            : null,
        initial_sections:
          state.sections.length > 0 ? state.sections : undefined,
        hidden_item_ids:
          state.hiddenItemIds.length > 0 ? state.hiddenItemIds : undefined,
        total_budget: state.totalBudget ?? undefined,
        start_date: state.startDate ?? undefined,
        end_date: state.endDate ?? undefined,
        carryover_mode: state.carryoverMode,
      };

      const result = await createBudget(input);

      if ("error" in result && result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Failed to create budget");
        return;
      }

      if (!("data" in result) || !result.data) {
        toast.error("Something went wrong. Please try again.");
        return;
      }

      toast.success("Budget created!");

      // Navigate to the new budget (use slug for readable URL)
      router.push(`/budget?id=${result.data.slug}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to create budget:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create budget");
    } finally {
      // ALWAYS clear timeout and reset loading state
      clearTimeout(timeout);
      setIsCreating(false);
    }
  }, [state, partnershipId, router]);

  // Animation variants for step transitions
  const variants = {
    enter: (d: number) => ({
      x: d > 0 ? 80 : -80,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (d: number) => ({
      x: d > 0 ? -80 : 80,
      opacity: 0,
    }),
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 md:pt-8">
      {/* Progress bar */}
      <div className="flex items-center gap-1.5 mb-6" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={STEP_COUNT} aria-label={`Step ${currentStep + 1} of ${STEP_COUNT}: ${STEP_LABELS[currentStep]}`}>
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => i < currentStep && goToStep(i)}
            disabled={i >= currentStep}
            className="h-1.5 flex-1 rounded-full transition-colors duration-300 cursor-pointer disabled:cursor-default"
            style={{
              backgroundColor:
                i <= currentStep
                  ? "var(--brand-coral)"
                  : "var(--border)",
            }}
            aria-label={`${STEP_LABELS[i]}${i < currentStep ? " (completed)" : i === currentStep ? " (current)" : ""}`}
          />
        ))}
      </div>

      {/* Step label */}
      <div className="flex items-center justify-between mb-6">
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          Step {currentStep + 1} of {STEP_COUNT}
          <span className="mx-1.5">&middot;</span>
          {STEP_LABELS[currentStep]}
        </span>
      </div>

      {/* Back button */}
      {currentStep > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="mb-4 cursor-pointer -ml-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
          Back
        </Button>
      )}

      {currentStep === 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/budget")}
          className="mb-4 cursor-pointer -ml-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
          Cancel
        </Button>
      )}

      {/* Step content with animation */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: "easeInOut" }}
        >
          {currentStep === 0 && (
            <WizardWelcomeStep
              state={state}
              onUpdate={updateState}
              onNext={goNext}
            />
          )}
          {currentStep === 1 && (
            <WizardPrerequisitesStep
              state={state}
              prerequisites={prerequisites}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 2 && (
            <WizardTemplateStep
              state={state}
              onUpdate={updateState}
              onNext={goNext}
              initialTemplate={initialTemplate}
            />
          )}
          {currentStep === 3 && (
            <WizardFinetuneStep
              state={state}
              onUpdate={updateState}
              onNext={goNext}
              goals={prerequisites.goals}
              investments={prerequisites.investments}
            />
          )}
          {currentStep === 4 && (
            <WizardReviewStep
              state={state}
              onCreate={handleCreate}
              isCreating={isCreating}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
