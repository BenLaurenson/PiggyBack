"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, Save, Flame } from "lucide-react";
import { updateFireProfile } from "@/app/actions/fire";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"],
});

const VARIANT_OPTIONS = [
  { value: "lean", label: "Lean FIRE", description: "Essentials only — frugal retirement" },
  { value: "regular", label: "Regular FIRE", description: "Current lifestyle maintained" },
  { value: "fat", label: "Fat FIRE", description: "Current lifestyle + 25% buffer" },
  { value: "coast", label: "Coast FIRE", description: "Stop saving, let growth do the work" },
] as const;

const RISK_OPTIONS = [
  { rate: "5.00", label: "Conservative (5%)", description: "Bonds-heavy portfolio" },
  { rate: "7.00", label: "Balanced (7%)", description: "Diversified stocks + bonds" },
  { rate: "9.00", label: "Aggressive (9%)", description: "Growth-oriented equities" },
] as const;

export default function FireSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [targetRetirementAge, setTargetRetirementAge] = useState("");
  const [asapMode, setAsapMode] = useState(true);
  const [superBalance, setSuperBalance] = useState("");
  const [superContributionRate, setSuperContributionRate] = useState("11.50");
  const [customSgRate, setCustomSgRate] = useState(false);
  const [expectedReturnRate, setExpectedReturnRate] = useState("7.00");
  const [customReturnRate, setCustomReturnRate] = useState(false);
  const [outsideSuperReturnRate, setOutsideSuperReturnRate] = useState("7.00");
  const [useSeparateReturnRate, setUseSeparateReturnRate] = useState(false);
  const [customOutsideReturnRate, setCustomOutsideReturnRate] = useState(false);
  const [incomeGrowthRate, setIncomeGrowthRate] = useState("0");
  const [spendingGrowthRate, setSpendingGrowthRate] = useState("0");
  const [fireVariant, setFireVariant] = useState<"lean" | "regular" | "fat" | "coast">("regular");
  const [annualExpenseOverride, setAnnualExpenseOverride] = useState("");
  const [useExpenseOverride, setUseExpenseOverride] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "date_of_birth, target_retirement_age, super_balance_cents, super_contribution_rate, expected_return_rate, outside_super_return_rate, income_growth_rate, spending_growth_rate, fire_variant, annual_expense_override_cents, fire_onboarded"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        if (profile.date_of_birth) setDateOfBirth(profile.date_of_birth);
        if (profile.target_retirement_age !== null) {
          setTargetRetirementAge(String(profile.target_retirement_age));
          setAsapMode(false);
        }
        if (profile.super_balance_cents) {
          setSuperBalance(String(profile.super_balance_cents / 100));
        }
        if (profile.super_contribution_rate !== null) {
          setSuperContributionRate(Number(profile.super_contribution_rate).toFixed(2));
          const isStandard = ["11.50", "12.00", "15.00", "20.00"].includes(
            Number(profile.super_contribution_rate).toFixed(2)
          );
          setCustomSgRate(!isStandard);
        }
        if (profile.expected_return_rate !== null) {
          setExpectedReturnRate(Number(profile.expected_return_rate).toFixed(2));
          const isStandard = ["5.00", "7.00", "9.00"].includes(
            Number(profile.expected_return_rate).toFixed(2)
          );
          setCustomReturnRate(!isStandard);
        }
        if (profile.outside_super_return_rate != null) {
          setOutsideSuperReturnRate(Number(profile.outside_super_return_rate).toFixed(2));
          setUseSeparateReturnRate(true);
          const isStandardOutside = ["5.00", "7.00", "9.00"].includes(
            Number(profile.outside_super_return_rate).toFixed(2)
          );
          setCustomOutsideReturnRate(!isStandardOutside);
        }
        if (profile.income_growth_rate != null) {
          setIncomeGrowthRate(String(Number(profile.income_growth_rate)));
        }
        if (profile.spending_growth_rate != null) {
          setSpendingGrowthRate(String(Number(profile.spending_growth_rate)));
        }
        if (profile.fire_variant) setFireVariant(profile.fire_variant);
        if (profile.annual_expense_override_cents) {
          setAnnualExpenseOverride(String(profile.annual_expense_override_cents / 100));
          setUseExpenseOverride(true);
        }
      }

      setLoading(false);
    }
    loadProfile();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    const result = await updateFireProfile({
      date_of_birth: dateOfBirth || null,
      target_retirement_age: asapMode ? null : (parseInt(targetRetirementAge) || null),
      super_balance_cents: Math.round((parseFloat(superBalance) || 0) * 100),
      super_contribution_rate: parseFloat(superContributionRate) || 11.5,
      expected_return_rate: parseFloat(expectedReturnRate) || 7.0,
      outside_super_return_rate: useSeparateReturnRate
        ? (parseFloat(outsideSuperReturnRate) || null)
        : null,
      income_growth_rate: parseFloat(incomeGrowthRate) || 0,
      spending_growth_rate: parseFloat(spendingGrowthRate) || 0,
      fire_variant: fireVariant,
      annual_expense_override_cents: useExpenseOverride
        ? Math.round((parseFloat(annualExpenseOverride) || 0) * 100)
        : null,
    });

    setSaving(false);

    if (result && "success" in result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (loading) {
    return (
      <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/settings"
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-nunito)] text-2xl font-black text-text-primary flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            FIRE Settings
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Configure your Financial Independence plan
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Details */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary">
              Personal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Date of Birth
              </Label>
              <Input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="max-w-xs"
              />
              <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                Used to calculate your current age and projection timeline.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                  Target Retirement Age
                </Label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                    As early as possible
                  </Label>
                  <Switch
                    checked={asapMode}
                    onCheckedChange={(checked) => {
                      setAsapMode(checked);
                      if (checked) setTargetRetirementAge("");
                    }}
                  />
                </div>
              </div>
              {!asapMode && (
                <Input
                  type="number"
                  value={targetRetirementAge}
                  onChange={(e) => setTargetRetirementAge(e.target.value)}
                  placeholder="e.g. 50"
                  min={25}
                  max={80}
                  className="max-w-xs"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Super Details */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary">
              Superannuation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Current Super Balance
              </Label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
                <Input
                  type="number"
                  value={superBalance}
                  onChange={(e) => setSuperBalance(e.target.value)}
                  placeholder="0"
                  className="pl-7"
                  min={0}
                  step={100}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Employer Contribution Rate
              </Label>
              {!customSgRate ? (
                <Select
                  value={superContributionRate}
                  onValueChange={(val) => {
                    if (val === "custom") {
                      setCustomSgRate(true);
                    } else {
                      setSuperContributionRate(val);
                    }
                  }}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="11.50">11.5% (Standard SG 2025-26)</SelectItem>
                    <SelectItem value="12.00">12%</SelectItem>
                    <SelectItem value="15.00">15%</SelectItem>
                    <SelectItem value="20.00">20%</SelectItem>
                    <SelectItem value="custom">Custom...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 max-w-xs">
                  <Input
                    type="number"
                    value={superContributionRate}
                    onChange={(e) => setSuperContributionRate(e.target.value)}
                    min={0}
                    max={100}
                    step={0.5}
                  />
                  <span className="text-sm text-text-tertiary">%</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomSgRate(false);
                      setSuperContributionRate("11.50");
                    }}
                    className="text-xs"
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Investment Returns */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary">
              Investment Returns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                {useSeparateReturnRate ? "Super Fund Return Rate (after inflation)" : "Expected Annual Return (after inflation)"}
              </Label>
              {!customReturnRate ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {RISK_OPTIONS.map((opt) => (
                    <button
                      key={opt.rate}
                      onClick={() => setExpectedReturnRate(opt.rate)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        expectedReturnRate === opt.rate
                          ? "border-orange-400 bg-orange-50"
                          : "border-border hover:border-orange-200"
                      }`}
                    >
                      <p className="font-[family-name:var(--font-nunito)] text-sm font-bold text-text-primary">
                        {opt.label}
                      </p>
                      <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                        {opt.description}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 max-w-xs">
                  <Input
                    type="number"
                    value={expectedReturnRate}
                    onChange={(e) => setExpectedReturnRate(e.target.value)}
                    min={0}
                    max={20}
                    step={0.5}
                  />
                  <span className="text-sm text-text-tertiary">%</span>
                </div>
              )}
              <button
                onClick={() => setCustomReturnRate(!customReturnRate)}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors font-[family-name:var(--font-dm-sans)]"
              >
                {customReturnRate ? "Use presets" : "Enter custom rate"}
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                  Different rate for outside-super investments
                </Label>
                <Switch
                  checked={useSeparateReturnRate}
                  onCheckedChange={setUseSeparateReturnRate}
                />
              </div>
              {useSeparateReturnRate && (
                <div className="space-y-2">
                  <Label className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
                    Outside Super Return Rate (after inflation)
                  </Label>
                  {!customOutsideReturnRate ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {RISK_OPTIONS.map((opt) => (
                        <button
                          key={`outside-${opt.rate}`}
                          onClick={() => setOutsideSuperReturnRate(opt.rate)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            outsideSuperReturnRate === opt.rate
                              ? "border-orange-400 bg-orange-50"
                              : "border-border hover:border-orange-200"
                          }`}
                        >
                          <p className="font-[family-name:var(--font-nunito)] text-sm font-bold text-text-primary">
                            {opt.label}
                          </p>
                          <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                            {opt.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 max-w-xs">
                      <Input
                        type="number"
                        value={outsideSuperReturnRate}
                        onChange={(e) => setOutsideSuperReturnRate(e.target.value)}
                        min={0}
                        max={20}
                        step={0.5}
                      />
                      <span className="text-sm text-text-tertiary">%</span>
                    </div>
                  )}
                  <button
                    onClick={() => setCustomOutsideReturnRate(!customOutsideReturnRate)}
                    className="text-xs text-text-tertiary hover:text-text-secondary transition-colors font-[family-name:var(--font-dm-sans)]"
                  >
                    {customOutsideReturnRate ? "Use presets" : "Enter custom rate"}
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Growth Assumptions */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary">
              Growth Assumptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Annual Income Growth
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: "0", label: "0%", description: "No growth" },
                  { value: "2", label: "2%", description: "Inflation match" },
                  { value: "3", label: "3%", description: "Steady growth" },
                  { value: "5", label: "5%", description: "Career growth" },
                ].map((opt) => (
                  <button
                    key={`income-${opt.value}`}
                    onClick={() => setIncomeGrowthRate(opt.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      incomeGrowthRate === opt.value
                        ? "border-orange-400 bg-orange-50"
                        : "border-border hover:border-orange-200"
                    }`}
                  >
                    <p className="font-[family-name:var(--font-nunito)] text-sm font-bold text-text-primary">
                      {opt.label}
                    </p>
                    <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                      {opt.description}
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                Expected annual salary growth. Increases your savings and super contributions over time.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Annual Spending Growth (Inflation)
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: "0", label: "0%", description: "No inflation" },
                  { value: "2", label: "2%", description: "Target CPI" },
                  { value: "3", label: "3%", description: "Above target" },
                  { value: "4", label: "4%", description: "High inflation" },
                ].map((opt) => (
                  <button
                    key={`spending-${opt.value}`}
                    onClick={() => setSpendingGrowthRate(opt.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      spendingGrowthRate === opt.value
                        ? "border-orange-400 bg-orange-50"
                        : "border-border hover:border-orange-200"
                    }`}
                  >
                    <p className="font-[family-name:var(--font-nunito)] text-sm font-bold text-text-primary">
                      {opt.label}
                    </p>
                    <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                      {opt.description}
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                Expected annual increase in your expenses. Increases your FIRE target over time.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* FIRE Variant */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary">
              FIRE Variant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VARIANT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFireVariant(opt.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    fireVariant === opt.value
                      ? "border-orange-400 bg-orange-50"
                      : "border-border hover:border-orange-200"
                  }`}
                >
                  <p className="font-[family-name:var(--font-nunito)] text-sm font-bold text-text-primary">
                    {opt.label}
                  </p>
                  <p className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Label className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                  Override Annual Expenses
                </Label>
                <Switch
                  checked={useExpenseOverride}
                  onCheckedChange={setUseExpenseOverride}
                />
              </div>
              {useExpenseOverride && (
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
                  <Input
                    type="number"
                    value={annualExpenseOverride}
                    onChange={(e) => setAnnualExpenseOverride(e.target.value)}
                    placeholder="Annual expense target"
                    className="pl-7"
                    min={0}
                    step={1000}
                  />
                  <p className="text-xs text-text-tertiary mt-1 font-[family-name:var(--font-dm-sans)]">
                    Override the calculated annual expenses from your transaction history.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="lg:col-span-2 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || !dateOfBirth}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save FIRE Settings"}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 font-[family-name:var(--font-dm-sans)]">
              Settings saved
            </span>
          )}
          {!dateOfBirth && (
            <span className="text-xs text-text-tertiary font-[family-name:var(--font-dm-sans)]">
              Date of birth is required
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
