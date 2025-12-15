"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Check } from "lucide-react";

interface CompleteStepProps {
  completedSteps: string[];
  onComplete: () => void;
}

const stepChecklist = [
  { id: "profile", label: "Profile set up" },
  { id: "bank", label: "Bank connected" },
  { id: "income", label: "Income configured" },
  { id: "ai", label: "AI assistant configured" },
];

export function CompleteStep({ completedSteps, onComplete }: CompleteStepProps) {
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    setLoading(true);
    await onComplete();
  };

  return (
    <div className="text-center space-y-6">
      <div className="p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center" style={{ backgroundColor: "var(--pastel-mint-light)" }}>
        <Sparkles className="h-12 w-12" style={{ color: "var(--pastel-mint-dark)" }} />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
          You&apos;re all set!
        </h2>
        <p className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
          Here&apos;s what you&apos;ve configured:
        </p>
      </div>

      {/* Checklist */}
      <div className="max-w-xs mx-auto space-y-2 text-left">
        {stepChecklist.map((step) => {
          const isComplete = completedSteps.includes(step.id);
          return (
            <div key={step.id} className="flex items-center gap-3 py-1">
              <div
                className="h-5 w-5 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: isComplete ? "var(--pastel-mint)" : "var(--surface)",
                }}
              >
                {isComplete && <Check className="h-3 w-3 text-white" />}
              </div>
              <span
                className="text-sm font-[family-name:var(--font-dm-sans)]"
                style={{ color: isComplete ? "var(--text-primary)" : "var(--text-tertiary)" }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="pt-4 max-w-sm mx-auto">
        <Button
          onClick={handleComplete}
          size="lg"
          className="w-full rounded-xl font-[family-name:var(--font-nunito)] font-bold"
          style={{ backgroundColor: "var(--pastel-coral)", color: "white" }}
          disabled={loading}
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
