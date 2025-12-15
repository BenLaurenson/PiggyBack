"use client";

import { useState } from "react";
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
import { completeOnboarding } from "@/app/actions/onboarding";

const steps = [
  { id: "welcome", label: "Welcome" },
  { id: "profile", label: "Profile" },
  { id: "bank", label: "Bank" },
  { id: "income", label: "Income" },
  { id: "ai", label: "AI" },
  { id: "complete", label: "Done" },
];

interface OnboardingWizardProps {
  userId: string;
  email: string;
  existingDisplayName: string;
  stepsCompleted: string[];
}

export function OnboardingWizard({ userId, email, existingDisplayName, stepsCompleted }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>(stepsCompleted);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const progress = ((currentStep + 1) / steps.length) * 100;

  const markStepComplete = (stepId: string) => {
    setCompletedSteps(prev => prev.includes(stepId) ? prev : [...prev, stepId]);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setError(null);
    try {
      await completeOnboarding(completedSteps);
      router.push("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding. Please try again.");
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />;
      case 1:
        return (
          <ProfileStep
            userId={userId}
            existingDisplayName={existingDisplayName}
            onNext={() => { markStepComplete("profile"); handleNext(); }}
          />
        );
      case 2:
        return (
          <BankStep
            onNext={() => handleNext()}
            onComplete={() => { markStepComplete("bank"); handleNext(); }}
          />
        );
      case 3:
        return (
          <IncomeStep
            userId={userId}
            onNext={() => handleNext()}
            onComplete={() => { markStepComplete("income"); handleNext(); }}
          />
        );
      case 4:
        return (
          <AiStep
            userId={userId}
            onNext={() => handleNext()}
            onComplete={() => { markStepComplete("ai"); handleNext(); }}
          />
        );
      case 5:
        return <CompleteStep completedSteps={completedSteps} onComplete={handleComplete} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
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
              <span className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
                PiggyBack
              </span>
            </div>
            {currentStep > 0 && currentStep < steps.length - 1 && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-1" />
          <div className="flex justify-between mt-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className="text-xs font-[family-name:var(--font-dm-sans)]"
                style={{ color: index <= currentStep ? "var(--text-primary)" : "var(--text-tertiary)" }}
              >
                {step.label}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg border-0 shadow-none md:border md:shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
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
