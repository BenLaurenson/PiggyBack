"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Users } from "lucide-react";
import type { WizardState } from "../budget-create-wizard";

interface WizardWelcomeStepProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
  onNext: () => void;
}

const BUDGET_TYPES = [
  {
    value: "personal" as const,
    label: "Personal",
    description: "Track your own spending and savings",
    Icon: User,
    color: "var(--pastel-blue-dark, #60A5FA)",
    bg: "var(--pastel-blue-light, rgba(96,165,250,0.15))",
  },
  {
    value: "household" as const,
    label: "Household",
    description: "Shared budget with your partner",
    Icon: Users,
    color: "var(--pastel-mint-dark, #34D399)",
    bg: "var(--pastel-mint-light, rgba(52,211,153,0.15))",
    comingSoon: true,
  },
];

const EMOJI_OPTIONS = ["💰", "🏠", "🏡", "📊", "🚀", "🌴", "💳", "🎯", "📈", "🪙", "💵", "🎪"];

export function WizardWelcomeStep({
  state,
  onUpdate,
  onNext,
}: WizardWelcomeStepProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const canContinue = state.name.trim().length > 0;

  return (
    <div>
      <h2
        className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-bold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Create a Budget
      </h2>
      <p
        className="text-base mb-8"
        style={{ color: "var(--text-secondary)" }}
      >
        Give your budget a name and choose what type it is.
      </p>

      {/* Budget name + emoji */}
      <div className="mb-8">
        <Label
          htmlFor="budget-name"
          className="text-sm font-medium mb-2 block"
          style={{ color: "var(--text-primary)" }}
        >
          Budget Name
        </Label>
        <div className="flex items-center gap-2">
          {/* Emoji picker trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="h-11 w-11 rounded-xl flex items-center justify-center text-xl border cursor-pointer transition-colors duration-200 shrink-0"
              style={{
                backgroundColor: "var(--surface-elevated)",
                borderColor: showEmojiPicker
                  ? "var(--brand-coral)"
                  : "var(--border)",
              }}
              aria-label="Choose emoji"
            >
              {state.emoji}
            </button>
            {showEmojiPicker && (
              <div
                className="absolute top-full left-0 mt-2 p-2 rounded-xl shadow-lg border z-10 grid grid-cols-6 gap-1 w-52"
                style={{
                  backgroundColor: "var(--surface-elevated)",
                  borderColor: "var(--border)",
                }}
              >
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onUpdate({ emoji });
                      setShowEmojiPicker(false);
                    }}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-lg cursor-pointer transition-colors duration-150 hover:bg-[var(--muted)]"
                    aria-label={`Select ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Input
            id="budget-name"
            value={state.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g. My Budget, Household, Holiday Fund\u2026"
            className="h-11 rounded-xl flex-1"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>

      {/* Budget type */}
      <div className="mb-8">
        <Label
          className="text-sm font-medium mb-3 block"
          style={{ color: "var(--text-primary)" }}
        >
          Budget Type
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BUDGET_TYPES.map(({ value, label, description, Icon, color, bg, comingSoon }) => {
            const isSelected = state.budgetType === value;
            const isDisabled = !!comingSoon;
            return (
              <button
                key={value}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onUpdate({
                    budgetType: value,
                    budgetView: value === "household" ? "shared" : "individual",
                  });
                }}
                className="rounded-2xl p-4 text-left border-2 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-2 relative"
                style={{
                  backgroundColor: isDisabled
                    ? "var(--surface-elevated)"
                    : isSelected
                      ? bg
                      : "var(--surface-elevated)",
                  borderColor: isDisabled
                    ? "var(--border)"
                    : isSelected
                      ? color
                      : "var(--border)",
                  opacity: isDisabled ? 0.55 : 1,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                }}
              >
                {isDisabled && (
                  <span
                    className="absolute top-3 right-3 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      color: "var(--text-tertiary)",
                      backgroundColor: "var(--muted)",
                    }}
                  >
                    Coming Soon
                  </span>
                )}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: isSelected && !isDisabled ? color : "var(--muted)" }}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: isSelected && !isDisabled ? "white" : "var(--text-secondary)" }}
                    aria-hidden="true"
                  />
                </div>
                <span
                  className="font-[family-name:var(--font-nunito)] font-bold text-sm block"
                  style={{ color: "var(--text-primary)" }}
                >
                  {label}
                </span>
                <span
                  className="text-xs mt-0.5 block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Continue */}
      <Button
        onClick={onNext}
        disabled={!canContinue}
        size="lg"
        className="w-full rounded-xl h-12 text-base font-[family-name:var(--font-nunito)] font-bold cursor-pointer"
        style={{
          backgroundColor: canContinue
            ? "var(--brand-coral)"
            : "var(--muted)",
          color: canContinue ? "white" : "var(--text-tertiary)",
        }}
      >
        Continue
      </Button>
    </div>
  );
}
