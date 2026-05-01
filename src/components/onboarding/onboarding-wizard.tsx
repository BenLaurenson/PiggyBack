"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { WelcomeStep } from "./steps/welcome-step";
import { ProfileStep } from "./steps/profile-step";
import { BankStep } from "./steps/bank-step";
import { IncomeStep } from "./steps/income-step";
import { AiStep } from "./steps/ai-step";
import { CompleteStep } from "./steps/complete-step";
import { advanceOnboardingState, type OnboardingState } from "@/app/actions/onboarding";

/**
 * Wizard view ordering — purely for the progress bar. The BE state machine
 * is the source of truth for which step the user is actually on; this list
 * drives presentation only.
 */
const STEP_ORDER = ["PROFILE", "BANK", "INCOME", "AI", "PARTNER"] as const;
type StepView = (typeof STEP_ORDER)[number];

const STEP_LABELS: Record<StepView, string> = {
  PROFILE: "Profile",
  BANK: "Bank",
  INCOME: "Income",
  AI: "AI",
  PARTNER: "Done",
};

const NEXT_STATE: Record<StepView, OnboardingState> = {
  PROFILE: "BANK",
  BANK: "INCOME",
  INCOME: "AI",
  AI: "PARTNER",
  PARTNER: "READY",
};

const WELCOME_SEEN_KEY = "piggyback:onboarding:welcome-seen";

interface OnboardingWizardProps {
  userId: string;
  email: string;
  existingDisplayName: string;
  initialState: OnboardingState;
  bankAccountCount?: number;
}

/**
 * BE-driven wizard. Reads `initialState` from the server (sourced from
 * `profiles.onboarding_state`), transitions via `advanceOnboardingState`,
 * and renders whichever step matches the current state. No FE-side
 * `completedSteps` array — the BE owns the truth.
 *
 * Spec: docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md
 */
export function OnboardingWizard({
  userId,
  email: _email,
  existingDisplayName,
  initialState,
  bankAccountCount = 0,
}: OnboardingWizardProps) {
  const router = useRouter();

  // The current state is whatever the BE most recently confirmed. We can
  // optimistically update on a successful `advanceOnboardingState` call,
  // but the BE response is always the final word.
  const [currentState, setCurrentState] = useState<OnboardingState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // The Welcome screen is purely cosmetic — it doesn't have a state of its
  // own. We show it on first arrival (when state is PROFILE and we haven't
  // shown it before in this browser). After that, refreshing lands the
  // user directly on the profile form.
  const [welcomeSeen, setWelcomeSeen] = useState<boolean>(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(WELCOME_SEEN_KEY) === "true";
    setWelcomeSeen(seen);
  }, []);

  const dismissWelcome = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
    }
    setWelcomeSeen(true);
  };

  // Map state → wizard view. PARTNER currently renders the CompleteStep
  // until the dedicated PARTNER component lands (spec sub-section
  // "PARTNER step (NEW)").
  const view: StepView | "WELCOME" | "READY" = useMemo(() => {
    if (currentState === "READY") return "READY";
    if (currentState === "PROFILE" && !welcomeSeen) return "WELCOME";
    if (currentState === "PROVISIONING") return "PROFILE";
    if (currentState === "ABANDONED") return "PROFILE";
    if ((STEP_ORDER as readonly string[]).includes(currentState)) {
      return currentState as StepView;
    }
    return "PROFILE";
  }, [currentState, welcomeSeen]);

  // Once the BE confirms READY, push to /home. The page guard does the
  // same on next render but pushing here saves a round-trip.
  useEffect(() => {
    if (currentState === "READY") {
      router.push("/home");
    }
  }, [currentState, router]);

  /**
   * Advance the state machine. Optimistic on success; on a state mismatch
   * (e.g., the user advanced from another tab) we adopt the BE's view.
   */
  const advance = (toState: OnboardingState, fromState: OnboardingState = currentState) => {
    setError(null);
    startTransition(async () => {
      const result = await advanceOnboardingState(fromState, toState);
      if (result.ok) {
        setCurrentState(result.currentState);
      } else {
        // Adopt the BE's authoritative state and surface a brief error.
        if (result.currentState !== currentState) {
          setCurrentState(result.currentState);
        }
        if (result.reason && result.reason !== "state mismatch") {
          setError(result.reason);
        }
      }
    });
  };

  const handleBack = () => {
    // "Back" never regresses BE state — it just lets the user re-edit a
    // previous step (e.g., fix display name from BANK). For now we treat
    // back as a no-op above PROFILE; in-step components own their internal
    // navigation.
    if (currentState === "BANK") setCurrentState("PROFILE");
    else if (currentState === "INCOME") setCurrentState("BANK");
    else if (currentState === "AI") setCurrentState("INCOME");
    else if (currentState === "PARTNER") setCurrentState("AI");
  };

  // Progress bar derives from the view, not the BE state — so going Back
  // visually moves the indicator backwards even though state stays put.
  const stepIndex = (STEP_ORDER as readonly string[]).indexOf(view as string);
  const progress = view === "WELCOME"
    ? (1 / (STEP_ORDER.length + 1)) * 100
    : view === "READY"
      ? 100
      : ((stepIndex + 1) / STEP_ORDER.length) * 100;

  const renderStep = () => {
    switch (view) {
      case "WELCOME":
        return <WelcomeStep onNext={dismissWelcome} />;
      case "PROFILE":
        return (
          <ProfileStep
            userId={userId}
            existingDisplayName={existingDisplayName}
            onNext={() => advance("BANK", "PROFILE")}
          />
        );
      case "BANK":
        return (
          <BankStep
            onNext={() => advance("INCOME", "BANK")}
            onComplete={() => advance("INCOME", "BANK")}
            isStepCompleted={false}
            serverAccountCount={bankAccountCount}
          />
        );
      case "INCOME":
        return (
          <IncomeStep
            userId={userId}
            onNext={() => advance("AI", "INCOME")}
            onComplete={() => advance("AI", "INCOME")}
            hasBankAccounts={bankAccountCount > 0}
          />
        );
      case "AI":
        return (
          <AiStep
            userId={userId}
            onNext={() => advance("PARTNER", "AI")}
            onComplete={() => advance("PARTNER", "AI")}
          />
        );
      case "PARTNER":
        return (
          <CompleteStep
            // CompleteStep just shows the summary + a Done button. Until the
            // dedicated PARTNER step ships, completed-steps is purely
            // cosmetic — we mark all four prior steps as done since the
            // user only reaches PARTNER by passing through them.
            completedSteps={["profile", "bank", "income", "ai"]}
            onComplete={() => advance("READY", "PARTNER")}
          />
        );
      case "READY":
        // useEffect above will redirect to /home — render nothing.
        return null;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="relative w-10 h-10">
                <Image
                  src="/images/piggyback-icon.png"
                  alt="PiggyBack"
                  fill
                  sizes="40px"
                  className="object-contain"
                />
              </div>
              <span
                className="font-[family-name:var(--font-nunito)] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                PiggyBack
              </span>
            </div>
            {view !== "WELCOME" && view !== "PARTNER" && view !== "READY" && currentState !== "PROFILE" && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-1" />
          <div className="flex justify-between mt-2">
            {STEP_ORDER.map((step, index) => (
              <div
                key={step}
                className="text-xs font-[family-name:var(--font-dm-sans)]"
                style={{
                  color: index <= stepIndex ? "var(--text-primary)" : "var(--text-tertiary)",
                }}
              >
                {STEP_LABELS[step]}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card
          className="w-full max-w-lg border-0 shadow-none md:border md:shadow-sm"
          style={{ backgroundColor: "var(--surface-elevated)" }}
        >
          <CardContent className="pt-8 pb-8">
            {error && (
              <div
                className="mb-4 px-3 py-2 rounded-lg text-xs flex items-center justify-between"
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
            {renderStep()}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
