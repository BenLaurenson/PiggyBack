"use client";

import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import {
  calculateSavingsImpact,
  calculateIncomeImpact,
  calculateIncomeMilestones,
  type FireResult,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
} from "@/lib/fire-calculations";

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const formatCurrencyShort = (cents: number) => {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  return `$${dollars.toFixed(0)}`;
};

interface FireWhatIfProps {
  fireResult: FireResult;
  profile: FireProfile;
  spending: SpendingData;
  investments: InvestmentData;
  extraSavings: number;
  onExtraSavingsChange: (value: number) => void;
  extraIncome: number;
  onExtraIncomeChange: (value: number) => void;
}

export function FireWhatIf({
  fireResult,
  profile,
  spending,
  investments,
  extraSavings,
  onExtraSavingsChange,
  extraIncome,
  onExtraIncomeChange,
}: FireWhatIfProps) {
  const savingsImpact = useMemo(() => {
    if (extraSavings <= 0) return null;
    return calculateSavingsImpact(
      fireResult,
      extraSavings * 100,
      profile,
      spending,
      investments
    );
  }, [extraSavings, fireResult, profile, spending, investments]);

  const incomeImpact = useMemo(() => {
    if (extraIncome <= 0) return null;
    return calculateIncomeImpact(
      fireResult,
      extraIncome * 100,
      profile,
      spending,
      investments
    );
  }, [extraIncome, fireResult, profile, spending, investments]);

  const milestones = useMemo(
    () => calculateIncomeMilestones(fireResult, profile, spending, investments),
    [fireResult, profile, spending, investments]
  );

  const currentMonthlyIncome = spending.monthlyIncomeCents;
  const currentAnnualIncome = currentMonthlyIncome * 12;
  const targetMonthlyIncome = currentMonthlyIncome + extraIncome * 100;
  const targetAnnualIncome = targetMonthlyIncome * 12;

  return (
    <div className="space-y-6">
      {/* Current income context */}
      <div
        className="flex items-center justify-between p-3 rounded-xl"
        style={{ backgroundColor: "var(--surface)" }}
      >
        <div>
          <p
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            Current income
          </p>
          <p
            className="text-lg font-bold font-[family-name:var(--font-nunito)]"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(currentMonthlyIncome)}/mo
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            {formatCurrency(currentAnnualIncome)}/yr
          </p>
        </div>
        {extraIncome > 0 && (
          <div className="text-right">
            <p
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-tertiary)" }}
            >
              Target income
            </p>
            <p
              className="text-lg font-bold font-[family-name:var(--font-nunito)]"
              style={{ color: "var(--pastel-mint-dark)" }}
            >
              {formatCurrency(targetMonthlyIncome)}/mo
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--pastel-mint-dark)" }}
            >
              {formatCurrency(targetAnnualIncome)}/yr
            </p>
          </div>
        )}
      </div>

      {/* Two sliders side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Save More */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {"Save an extra\u2026"}
            </p>
            <div className="text-right">
              <span
                className="text-base font-bold font-[family-name:var(--font-nunito)]"
                style={{ color: "#f97316" }}
              >
                {formatCurrency(extraSavings * 100)}/mo
              </span>
              {extraSavings > 0 && (
                <p
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {formatCurrency(extraSavings * 100 * 12)}/yr
                </p>
              )}
            </div>
          </div>

          <Slider
            value={[extraSavings]}
            onValueChange={([val]) => onExtraSavingsChange(val)}
            min={0}
            max={5000}
            step={50}
            className="w-full"
            aria-label="Extra monthly savings"
          />

          <div
            className="flex justify-between text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span>$0</span>
            <span>$2.5k</span>
            <span>$5k</span>
          </div>

          {savingsImpact &&
          savingsImpact.yearsSaved !== null &&
          savingsImpact.yearsSaved > 0 ? (
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: "var(--pastel-mint-light)" }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--pastel-mint-dark)" }}
              >
                <span className="font-bold">
                  {savingsImpact.yearsSaved === 1
                    ? "1 year"
                    : `${savingsImpact.yearsSaved} years`}
                </span>{" "}
                earlier
              </p>
              {savingsImpact.originalFireAge !== null &&
                savingsImpact.newFireAge !== null && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Age {savingsImpact.originalFireAge} → {savingsImpact.newFireAge}
                  </p>
                )}
            </div>
          ) : extraSavings > 0 ? (
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: "var(--surface)" }}
            >
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Less than 1 year impact
              </p>
            </div>
          ) : null}
        </div>

        {/* Earn More */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {"Earn an extra\u2026"}
            </p>
            <div className="text-right">
              <span
                className="text-base font-bold font-[family-name:var(--font-nunito)]"
                style={{ color: "var(--pastel-blue-dark, #3b82f6)" }}
              >
                {formatCurrency(extraIncome * 100)}/mo
              </span>
              {extraIncome > 0 && (
                <p
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {formatCurrency(extraIncome * 100 * 12)}/yr
                </p>
              )}
            </div>
          </div>

          <Slider
            value={[extraIncome]}
            onValueChange={([val]) => onExtraIncomeChange(val)}
            min={0}
            max={10000}
            step={100}
            className="w-full"
            aria-label="Extra monthly income"
          />

          <div
            className="flex justify-between text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span>$0</span>
            <span>$5k</span>
            <span>$10k</span>
          </div>

          {incomeImpact &&
          incomeImpact.yearsSaved !== null &&
          incomeImpact.yearsSaved > 0 ? (
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: "var(--pastel-blue-light, #dbeafe)" }}
            >
              <p
                className="text-sm"
                style={{ color: "var(--pastel-blue-dark, #3b82f6)" }}
              >
                <span className="font-bold">
                  {incomeImpact.yearsSaved === 1
                    ? "1 year"
                    : `${incomeImpact.yearsSaved} years`}
                </span>{" "}
                earlier
              </p>
              {incomeImpact.originalFireAge !== null &&
                incomeImpact.newFireAge !== null && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Age {incomeImpact.originalFireAge} → {incomeImpact.newFireAge}
                    {" · +"}
                    {formatCurrencyShort(incomeImpact.extraSuperContributionCents)}
                    /yr super
                  </p>
                )}
            </div>
          ) : extraIncome > 0 ? (
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: "var(--surface)" }}
            >
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Less than 1 year impact
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Income Milestones */}
      {milestones.length > 0 && (
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Income milestones
          </p>
          <div className="grid grid-cols-4 gap-2">
            {milestones.map((m) => (
              <div
                key={m.annualIncomeCents}
                className="p-2.5 rounded-xl text-center"
                style={{ backgroundColor: "var(--surface)" }}
              >
                <p
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatCurrencyShort(m.annualIncomeCents)}/yr
                </p>
                {m.fireAge !== null ? (
                  <p
                    className="text-sm font-bold font-[family-name:var(--font-nunito)]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    FIRE by {m.fireAge}
                  </p>
                ) : (
                  <p
                    className="text-sm font-bold font-[family-name:var(--font-nunito)]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {"\u2014"}
                  </p>
                )}
                {m.yearsSaved !== null && m.yearsSaved > 0 && (
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--pastel-mint-dark)" }}
                  >
                    {m.yearsSaved}yr earlier
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
