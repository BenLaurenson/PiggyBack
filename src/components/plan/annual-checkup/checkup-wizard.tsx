"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  RotateCcw,
  ShoppingCart,
  PiggyBank,
  BarChart3,
  Building2,
  Landmark,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import {
  startOrResumeCheckup,
  saveCheckupStep,
  completeCheckup,
  resetCheckup,
} from "@/app/actions/checkup";
import type {
  AnnualCheckupData,
  CheckupReviewData,
} from "@/components/plan/plan-client";

// ============================================================================
// Step Config
// ============================================================================

const STEPS = [
  { num: 1, label: "Spend", fullLabel: "Spending Review", Icon: ShoppingCart },
  { num: 2, label: "Save", fullLabel: "Savings Review", Icon: PiggyBank },
  { num: 3, label: "Invest", fullLabel: "Investment Review", Icon: BarChart3 },
  { num: 4, label: "Debt", fullLabel: "Debt Review", Icon: Building2 },
  { num: 5, label: "Super", fullLabel: "Super Review", Icon: Landmark },
  { num: 6, label: "Insure", fullLabel: "Insurance Review", Icon: ShieldCheck },
  { num: 7, label: "Summary", fullLabel: "Summary & Actions", Icon: ListChecks },
];

function getCurrentFinancialYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

// ============================================================================
// Component
// ============================================================================

interface CheckupWizardProps {
  checkup: AnnualCheckupData | null;
  reviewData: CheckupReviewData;
  partnershipId: string;
}

export function CheckupWizard({
  checkup,
  reviewData,
  partnershipId,
}: CheckupWizardProps) {
  const fy = getCurrentFinancialYear();
  const [expanded, setExpanded] = useState(false);
  const [currentStep, setCurrentStep] = useState(checkup?.current_step || 1);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [localCheckup, setLocalCheckup] = useState(checkup);
  const [error, setError] = useState<string | null>(null);

  const isCompleted = localCheckup?.completed_at !== null && localCheckup?.completed_at !== undefined;

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await startOrResumeCheckup(fy);
      setLocalCheckup(result as AnnualCheckupData);
      setCurrentStep(result.current_step || 1);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (currentStep >= 7) return;
    setLoading(true);
    setError(null);
    try {
      await saveCheckupStep(fy, currentStep, { notes });
      // Update local state so stepper ticks appear immediately
      setLocalCheckup((prev) =>
        prev
          ? {
              ...prev,
              step_data: {
                ...(prev.step_data as Record<string, unknown>),
                [String(currentStep)]: {
                  notes,
                  completed_at: new Date().toISOString(),
                },
              },
            }
          : prev
      );
      setNotes("");
      setCurrentStep(getNextStep(currentStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save step. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    const prev = getPrevStep(currentStep);
    if (prev >= 1) setCurrentStep(prev);
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      await saveCheckupStep(fy, 7, { notes });
      await completeCheckup(fy, []);
      setLocalCheckup((prev) =>
        prev
          ? {
              ...prev,
              completed_at: new Date().toISOString(),
              step_data: {
                ...(prev.step_data as Record<string, unknown>),
                "7": { notes, completed_at: new Date().toISOString() },
              },
            }
          : prev
      );
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete checkup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    setError(null);
    try {
      await resetCheckup(fy);
      setLocalCheckup(null);
      setCurrentStep(1);
      setNotes("");
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart checkup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Determine which steps to show (skip debt if no HOME_LOAN accounts)
  const activeSteps = reviewData.hasDebt
    ? STEPS
    : STEPS.filter((s) => s.num !== 4);

  const getNextStep = (current: number): number => {
    if (!reviewData.hasDebt && current === 3) return 5;
    return current + 1;
  };

  const getPrevStep = (current: number): number => {
    if (!reviewData.hasDebt && current === 5) return 3;
    return current - 1;
  };

  return (
    <div
      className="border-0 shadow-sm rounded-2xl overflow-hidden"
      style={{
        backgroundColor: isCompleted
          ? "var(--pastel-mint-light)"
          : "var(--surface-elevated)",
      }}
    >
      {/* Section header */}
      <div
        className="px-5 py-3.5 flex items-center gap-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <ClipboardCheck
          className="w-4 h-4"
          style={{
            color: isCompleted
              ? "var(--pastel-mint-dark)"
              : "var(--text-tertiary)",
          }}
        />
        <span
          className="font-[family-name:var(--font-nunito)] text-base font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Annual Checkup FY{fy}
        </span>
        {isCompleted && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--pastel-mint)",
              color: "var(--pastel-mint-dark)",
            }}
          >
            Done
          </span>
        )}
        {!expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-3 text-xs font-medium cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
            onClick={handleStart}
            disabled={loading}
          >
            {loading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {isCompleted
              ? "Review"
              : localCheckup
                ? "Continue"
                : "Start Checkup"}
          </Button>
        )}
        {expanded && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs font-medium cursor-pointer"
              style={{ color: "var(--text-tertiary)" }}
              onClick={handleRestart}
              disabled={loading}
              aria-label="Restart checkup"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs font-medium cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setExpanded(false)}
            >
              Collapse
            </Button>
          </div>
        )}
      </div>

      {/* Error banner (shown even when collapsed, e.g. if handleStart fails) */}
      {error && (
        <div
          className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs flex items-center justify-between"
          style={{
            backgroundColor: "var(--pastel-coral-light, #fef2f2)",
            color: "var(--pastel-coral-dark, #991b1b)",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 font-bold cursor-pointer"
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}

      {expanded && (
        <div className="p-5">
          {/* Stepper */}
          <div className="flex items-center overflow-x-auto pb-4 mb-4 gap-0">
            {activeSteps.map((step, i) => {
              const isStepCompleted =
                localCheckup?.step_data &&
                (localCheckup.step_data as Record<string, unknown>)[
                  String(step.num)
                ] !== undefined;
              const isActive = currentStep === step.num;
              const isPending = !isStepCompleted && !isActive;

              return (
                <div key={step.num} className="flex items-center">
                  {/* Step circle */}
                  <button
                    className="flex flex-col items-center gap-1 cursor-pointer"
                    onClick={() => {
                      if (isStepCompleted || isActive)
                        setCurrentStep(step.num);
                    }}
                    disabled={isPending}
                    aria-label={`Step ${step.num}: ${step.fullLabel}, ${isStepCompleted ? "completed" : isActive ? "active" : "pending"}`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold font-[family-name:var(--font-nunito)] transition-all"
                      style={{
                        backgroundColor: isStepCompleted
                          ? "var(--pastel-mint)"
                          : isActive
                            ? "var(--brand-coral)"
                            : "transparent",
                        border: isPending
                          ? "2px solid var(--border)"
                          : "2px solid transparent",
                        color: isStepCompleted
                          ? "var(--pastel-mint-dark)"
                          : isActive
                            ? "white"
                            : "var(--text-tertiary)",
                      }}
                    >
                      {isStepCompleted ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        step.num
                      )}
                    </div>
                    <span
                      className="text-[10px] whitespace-nowrap"
                      style={{
                        color: isActive
                          ? "var(--text-primary)"
                          : "var(--text-tertiary)",
                      }}
                    >
                      {step.label}
                    </span>
                  </button>

                  {/* Connecting line */}
                  {i < activeSteps.length - 1 && (
                    <div
                      className="w-6 md:w-10 h-0.5 mx-1"
                      style={{
                        backgroundColor: isStepCompleted
                          ? "var(--pastel-mint)"
                          : "var(--border)",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Content */}
          <div className="space-y-4">
            <div>
              <h3
                className="text-sm font-semibold font-[family-name:var(--font-nunito)]"
                style={{ color: "var(--text-primary)" }}
              >
                {STEPS.find((s) => s.num === currentStep)?.fullLabel}
              </h3>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-tertiary)" }}
              >
                {getStepDescription(currentStep)}
              </p>
            </div>

            {/* Step-specific content */}
            <div
              className="rounded-lg p-3"
              style={{ backgroundColor: "var(--surface)" }}
            >
              <StepContent step={currentStep} reviewData={reviewData} />
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="step-notes"
                className="text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Notes (optional)
              </label>
              <textarea
                id="step-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full mt-1 rounded-lg p-2.5 text-sm resize-none"
                style={{
                  backgroundColor: "var(--surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
                rows={2}
                placeholder="Any thoughts or actions to remember..."
              />
            </div>

            {/* Navigation */}
            <div
              className="flex items-center justify-between pt-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={handleBack}
                disabled={currentStep <= 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              {currentStep < 7 ? (
                <Button
                  size="sm"
                  className="cursor-pointer"
                  onClick={handleNext}
                  disabled={loading}
                >
                  {loading && (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  )}
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="cursor-pointer"
                  onClick={handleComplete}
                  disabled={loading}
                >
                  {loading && (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  )}
                  Complete Checkup
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step Descriptions
// ============================================================================

function getStepDescription(step: number): string {
  switch (step) {
    case 1:
      return "Review your essential vs discretionary spending and compare to last year.";
    case 2:
      return "Check your emergency fund, savings goals progress, and savings rate.";
    case 3:
      return "Review your portfolio allocation, performance, and rebalancing needs.";
    case 4:
      return "Review your outstanding debts and repayment progress.";
    case 5:
      return "Check your super balance, contribution cap room, and projected retirement balance.";
    case 6:
      return "Review your insurance coverage across key categories.";
    case 7:
      return "Review generated action items and add any custom actions.";
    default:
      return "";
  }
}

// ============================================================================
// Helpers
// ============================================================================

const formatCurrency = (cents: number): string =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(cents) / 100);

function ProgressBar({
  percent,
  color,
}: {
  percent: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="w-full h-2 rounded-full overflow-hidden"
      style={{ backgroundColor: "var(--border)" }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

function MetricRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-2">
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <div className="text-right">
        <span
          className="text-sm font-semibold font-[family-name:var(--font-nunito)]"
          style={{ color: "var(--text-primary)" }}
        >
          {value}
        </span>
        {sub && (
          <span
            className="text-[10px] block"
            style={{ color: "var(--text-tertiary)" }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyStepState({
  Icon,
  message,
}: {
  Icon: typeof ShoppingCart;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <Icon className="w-8 h-8" style={{ color: "var(--text-tertiary)" }} />
      <p
        className="text-xs text-center max-w-sm"
        style={{ color: "var(--text-tertiary)" }}
      >
        {message}
      </p>
    </div>
  );
}

// ============================================================================
// Step Content (data visualization per step)
// ============================================================================

function StepContent({
  step,
  reviewData,
}: {
  step: number;
  reviewData: CheckupReviewData;
}) {
  switch (step) {
    case 1:
      return <StepSpending reviewData={reviewData} />;
    case 2:
      return <StepSavings reviewData={reviewData} />;
    case 3:
      return <StepInvestments reviewData={reviewData} />;
    case 4:
      return <StepDebt reviewData={reviewData} />;
    case 5:
      return <StepSuper reviewData={reviewData} />;
    case 6:
      return <InsuranceChecklist />;
    case 7:
      return <StepSummary reviewData={reviewData} />;
    default:
      return null;
  }
}

// ── Step 1: Spending ────────────────────────────────────────────────────────

function StepSpending({ reviewData }: { reviewData: CheckupReviewData }) {
  const { monthlyEssentialsCents, monthlyDiscretionaryCents, monthlyTotalSpendCents, topCategories } = reviewData;

  if (monthlyTotalSpendCents === 0) {
    return (
      <EmptyStepState
        Icon={ShoppingCart}
        message="No spending data available yet. Connect your bank account and transactions will flow in automatically."
      />
    );
  }

  const essentialPercent = monthlyTotalSpendCents > 0
    ? Math.round((monthlyEssentialsCents / monthlyTotalSpendCents) * 100)
    : 0;
  const discretionaryPercent = 100 - essentialPercent;

  return (
    <div className="space-y-4">
      {/* Spending split bar */}
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] font-medium" style={{ color: "var(--pastel-mint-dark)" }}>
            Essential {essentialPercent}%
          </span>
          <span className="text-[10px] font-medium" style={{ color: "var(--pastel-coral-dark)" }}>
            Discretionary {discretionaryPercent}%
          </span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${essentialPercent}%`,
              backgroundColor: "var(--pastel-mint)",
            }}
          />
          <div
            className="h-full"
            style={{
              width: `${discretionaryPercent}%`,
              backgroundColor: "var(--pastel-coral)",
            }}
          />
        </div>
      </div>

      {/* Totals */}
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <MetricRow label="Monthly total" value={formatCurrency(monthlyTotalSpendCents)} />
        <MetricRow label="Essentials" value={formatCurrency(monthlyEssentialsCents)} />
        <MetricRow label="Discretionary" value={formatCurrency(monthlyDiscretionaryCents)} />
      </div>

      {/* Top categories */}
      {topCategories.length > 0 && (
        <div>
          <p className="text-[10px] font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
            TOP CATEGORIES
          </p>
          <div className="space-y-1.5">
            {topCategories.slice(0, 5).map((cat) => (
              <div key={cat.name} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {cat.name}
                </span>
                <span
                  className="text-xs font-medium font-[family-name:var(--font-nunito)]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatCurrency(cat.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Savings ─────────────────────────────────────────────────────────

function StepSavings({ reviewData }: { reviewData: CheckupReviewData }) {
  const {
    liquidBalanceCents,
    emergencyFundMonths,
    savingsRatePercent,
    activeGoalsCount,
    goalsTotalSavedCents,
    goalsTotalTargetCents,
  } = reviewData;

  const efStatus: { color: string; label: string } =
    emergencyFundMonths >= 6
      ? { color: "var(--pastel-mint)", label: "Healthy" }
      : emergencyFundMonths >= 3
        ? { color: "var(--pastel-yellow)", label: "Building" }
        : { color: "var(--pastel-coral)", label: "Low" };

  const efPercent = Math.min(100, (emergencyFundMonths / 6) * 100);

  const goalsPercent =
    goalsTotalTargetCents > 0
      ? Math.round((goalsTotalSavedCents / goalsTotalTargetCents) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Emergency Fund */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Emergency Fund
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: efStatus.color, color: "white" }}
          >
            {efStatus.label}
          </span>
        </div>
        <div className="flex items-baseline gap-1 mb-1.5">
          <span
            className="text-lg font-bold font-[family-name:var(--font-nunito)]"
            style={{ color: "var(--text-primary)" }}
          >
            {emergencyFundMonths.toFixed(1)}
          </span>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            months of expenses covered
          </span>
        </div>
        <ProgressBar percent={efPercent} color={efStatus.color} />
        <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
          {formatCurrency(liquidBalanceCents)} liquid balance
        </p>
      </div>

      {/* Key metrics */}
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <MetricRow
          label="Savings rate"
          value={`${savingsRatePercent}%`}
          sub={savingsRatePercent >= 20 ? "On track" : savingsRatePercent >= 10 ? "Could improve" : "Needs attention"}
        />
        <MetricRow
          label="Active goals"
          value={String(activeGoalsCount)}
          sub={goalsTotalTargetCents > 0 ? `${goalsPercent}% overall progress` : undefined}
        />
      </div>

      {/* Goals progress bar */}
      {goalsTotalTargetCents > 0 && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {formatCurrency(goalsTotalSavedCents)} saved
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {formatCurrency(goalsTotalTargetCents)} target
            </span>
          </div>
          <ProgressBar
            percent={goalsPercent}
            color="var(--pastel-blue)"
          />
        </div>
      )}
    </div>
  );
}

// ── Step 3: Investments ─────────────────────────────────────────────────────

function StepInvestments({ reviewData }: { reviewData: CheckupReviewData }) {
  const {
    hasInvestments,
    totalInvestmentCents,
    investmentAllocation,
    rebalanceDeltas,
    hasTargetAllocations,
  } = reviewData;

  if (!hasInvestments) {
    return (
      <EmptyStepState
        Icon={BarChart3}
        message="No investments tracked yet. Visit the Invest page to add your portfolio."
      />
    );
  }

  const allocationColors = [
    "var(--pastel-blue)",
    "var(--pastel-mint)",
    "var(--pastel-yellow)",
    "var(--pastel-coral)",
    "var(--pastel-blue-dark)",
    "var(--pastel-mint-dark)",
  ];

  return (
    <div className="space-y-4">
      {/* Total */}
      <MetricRow label="Total portfolio" value={formatCurrency(totalInvestmentCents)} />

      {/* Allocation bar */}
      {investmentAllocation.length > 0 && (
        <div>
          <p className="text-[10px] font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
            ALLOCATION
          </p>
          <div className="flex h-3 rounded-full overflow-hidden mb-2">
            {investmentAllocation.map((a, i) => (
              <div
                key={a.assetType}
                className="h-full"
                style={{
                  width: `${a.percent}%`,
                  backgroundColor: allocationColors[i % allocationColors.length],
                }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {investmentAllocation.map((a, i) => (
              <div key={a.assetType} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: allocationColors[i % allocationColors.length] }}
                />
                <span className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
                  {a.assetType}
                </span>
                <span className="text-[10px] ml-auto font-medium" style={{ color: "var(--text-primary)" }}>
                  {a.percent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rebalancing */}
      {hasTargetAllocations && rebalanceDeltas.length > 0 && (
        <div>
          <p className="text-[10px] font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
            REBALANCING NEEDED
          </p>
          <div className="space-y-1.5">
            {rebalanceDeltas
              .filter((d) => Math.abs(d.deltaPercent) >= 1)
              .map((d) => (
                <div key={d.assetType} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {d.assetType}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {d.currentPercent}% → {d.targetPercent}%
                    </span>
                    <span
                      className="text-[10px] font-medium"
                      style={{
                        color: d.deltaPercent > 0
                          ? "var(--pastel-mint-dark)"
                          : "var(--pastel-coral-dark)",
                      }}
                    >
                      {d.deltaPercent > 0 ? "+" : ""}{d.deltaPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Debt ────────────────────────────────────────────────────────────

function StepDebt({ reviewData }: { reviewData: CheckupReviewData }) {
  const { hasDebt, homeLoanBalanceCents, homeLoanAccountCount } = reviewData;

  if (!hasDebt) {
    return (
      <EmptyStepState
        Icon={Building2}
        message="No debt accounts detected. You're debt-free!"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <MetricRow
          label="Outstanding home loans"
          value={formatCurrency(homeLoanBalanceCents)}
          sub={`${homeLoanAccountCount} account${homeLoanAccountCount !== 1 ? "s" : ""}`}
        />
      </div>
      <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
        Review your loan statements for interest rates and consider whether refinancing could save you money.
      </p>
    </div>
  );
}

// ── Step 5: Super ───────────────────────────────────────────────────────────

function StepSuper({ reviewData }: { reviewData: CheckupReviewData }) {
  const {
    hasSuperProfile,
    superBalanceCents,
    sgRate,
    annualIncomeCents,
    superCapRoomCents,
    currentAge,
    targetRetirementAge,
  } = reviewData;

  if (!hasSuperProfile) {
    return (
      <EmptyStepState
        Icon={Landmark}
        message="Set up your FIRE profile in Settings to review super details."
      />
    );
  }

  const CONCESSIONAL_CAP = 3000000; // $30,000 in cents
  const usedCents = CONCESSIONAL_CAP - superCapRoomCents;
  const capUsedPercent = CONCESSIONAL_CAP > 0 ? Math.round((usedCents / CONCESSIONAL_CAP) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Balance */}
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <MetricRow label="Super balance" value={formatCurrency(superBalanceCents)} />
        <MetricRow label="SG rate" value={`${sgRate}%`} sub={annualIncomeCents > 0 ? `on ${formatCurrency(annualIncomeCents)} income` : undefined} />
        {currentAge !== null && targetRetirementAge !== null && (
          <MetricRow
            label="Years to preservation"
            value={String(Math.max(0, targetRetirementAge - currentAge))}
            sub={`Age ${currentAge} → ${targetRetirementAge}`}
          />
        )}
      </div>

      {/* Concessional cap */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Concessional cap used
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            {formatCurrency(usedCents)} / {formatCurrency(CONCESSIONAL_CAP)}
          </span>
        </div>
        <ProgressBar
          percent={capUsedPercent}
          color={superCapRoomCents > 1000000 ? "var(--pastel-yellow)" : "var(--pastel-mint)"}
        />
        {superCapRoomCents > 0 && (
          <p className="text-[10px] mt-1" style={{ color: "var(--pastel-yellow-dark)" }}>
            {formatCurrency(superCapRoomCents)} cap room remaining this FY
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 7: Summary ─────────────────────────────────────────────────────────

function StepSummary({ reviewData }: { reviewData: CheckupReviewData }) {
  const { priorityRecommendationsSummary } = reviewData;

  const priorityIcon: Record<string, { color: string; label: string }> = {
    high: { color: "var(--pastel-coral-dark)", label: "High" },
    medium: { color: "var(--pastel-yellow-dark)", label: "Medium" },
    low: { color: "var(--pastel-mint-dark)", label: "Low" },
  };

  if (priorityRecommendationsSummary.length === 0) {
    return (
      <div className="py-4 text-center">
        <CheckCircle2
          className="w-8 h-8 mx-auto mb-2"
          style={{ color: "var(--pastel-mint-dark)" }}
        />
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Looking good!
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          No priority actions detected. Your finances are on track.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>
        ACTION ITEMS FROM YOUR REVIEW
      </p>
      {priorityRecommendationsSummary.map((item, i) => {
        const pConfig = priorityIcon[item.priority] || priorityIcon.medium;
        return (
          <div
            key={i}
            className="flex items-center gap-2 py-1.5"
          >
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: pConfig.color }}
            />
            <span className="text-xs flex-1" style={{ color: "var(--text-primary)" }}>
              {item.title}
            </span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ color: pConfig.color, backgroundColor: `color-mix(in srgb, ${pConfig.color} 15%, transparent)` }}
            >
              {pConfig.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Insurance Checklist (Step 6)
// ============================================================================

const INSURANCE_CATEGORIES = [
  "Life Insurance",
  "Income Protection",
  "Health Insurance",
  "Home & Contents",
  "Car Insurance",
  "Travel Insurance",
];

function InsuranceChecklist() {
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-3">
      <p
        className="text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        Toggle each category once you&apos;ve reviewed your coverage.
      </p>
      {INSURANCE_CATEGORIES.map((category) => (
        <div
          key={category}
          className="flex items-center justify-between p-2.5 rounded-lg"
          style={{ backgroundColor: "var(--surface-elevated)" }}
        >
          <span
            className="text-sm"
            style={{ color: "var(--text-primary)" }}
          >
            {category}
          </span>
          <button
            className="relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer"
            style={{
              backgroundColor: reviewed.has(category)
                ? "var(--pastel-mint)"
                : "var(--border)",
            }}
            onClick={() => {
              const next = new Set(reviewed);
              if (next.has(category)) next.delete(category);
              else next.add(category);
              setReviewed(next);
            }}
            aria-label={`${category}: ${reviewed.has(category) ? "reviewed" : "not reviewed"}`}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200"
              style={{
                backgroundColor: "white",
                transform: reviewed.has(category)
                  ? "translateX(22px)"
                  : "translateX(2px)",
              }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
