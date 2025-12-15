"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/client";
import { updateGoal } from "@/app/actions/goals";
import { Card, CardContent } from "@/components/ui/card";
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
import { ArrowLeft, Loader2, Save, Wallet } from "lucide-react";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

const goalIcons = [
  { id: "piggy-bank", emoji: "🐷", label: "Savings" },
  { id: "home", emoji: "🏠", label: "Home" },
  { id: "car", emoji: "🚗", label: "Car" },
  { id: "plane", emoji: "✈️", label: "Travel" },
  { id: "gift", emoji: "🎁", label: "Gift" },
  { id: "heart", emoji: "❤️", label: "Wedding" },
  { id: "ring", emoji: "💍", label: "Engagement" },
  { id: "baby", emoji: "👶", label: "Baby" },
  { id: "star", emoji: "⭐", label: "Other" },
];

const goalColors = [
  "oklch(0.75 0.12 25)", // Coral (brand primary)
  "oklch(0.88 0.08 280)", // Purple (info)
  "oklch(0.7 0.1 168)", // Teal (success)
  "oklch(0.85 0.14 85)", // Amber (warning)
  "oklch(0.65 0.15 25)", // Dark Coral
  "oklch(0.8 0.1 340)", // Pink
  "oklch(0.7 0.15 50)", // Orange
  "oklch(0.6 0.2 25)", // Red
];

export default function EditGoalPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const goalId = params.id as string;

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("piggy-bank");
  const [selectedColor, setSelectedColor] = useState(goalColors[0]);
  const [linkedAccountId, setLinkedAccountId] = useState<string>("none");
  const [saverAccounts, setSaverAccounts] = useState<Array<{ id: string; display_name: string; balance_cents: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      // Load goal
      const { data: goal } = await supabase
        .from("savings_goals")
        .select("*")
        .eq("id", goalId)
        .maybeSingle();

      if (goal) {
        setName(goal.name);
        setTargetAmount((goal.target_amount_cents / 100).toString());
        setCurrentAmount((goal.current_amount_cents / 100).toString());
        setDeadline(goal.deadline || "");
        setSelectedIcon(goal.icon);
        setSelectedColor(goal.color);
        setLinkedAccountId(goal.linked_account_id || "none");
      }

      // Load saver accounts
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: savers } = await supabase
          .from("accounts")
          .select("id, display_name, balance_cents")
          .eq("user_id", user.id)
          .eq("account_type", "SAVER")
          .eq("is_active", true)
          .order("display_name");

        setSaverAccounts(savers || []);
      }

      setLoading(false);
    }

    loadData();
  }, [goalId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await updateGoal(goalId, {
      name,
      target_amount_cents: Math.round(parseFloat(targetAmount) * 100),
      current_amount_cents: Math.round(parseFloat(currentAmount) * 100),
      deadline: deadline || null,
      icon: selectedIcon,
      color: selectedColor,
      linked_account_id: linkedAccountId !== "none" ? linkedAccountId : null,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push("/goals");
    router.refresh();
  };

  if (loading) {
    return (
      <div className={`p-4 md:p-6 max-w-2xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-coral" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 md:p-6 max-w-2xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link href="/goals" className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Goals
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Edit Goal
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          Update your savings goal
        </p>
      </div>

      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text">
                {error}
              </div>
            )}

            {/* Goal Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Goal Name
              </Label>
              <Input
                id="name"
                placeholder="e.g., Holiday Fund, New Car"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={saving}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            {/* Icon Selection */}
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Icon
              </Label>
              <div className="flex flex-wrap gap-2">
                {goalIcons.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    onClick={() => setSelectedIcon(icon.id)}
                    className={`p-3 rounded-lg text-2xl transition-all ${
                      selectedIcon === icon.id
                        ? "bg-brand-coral/20 ring-2 ring-ring-coral"
                        : "bg-secondary hover:bg-brand-coral-lighter"
                    }`}
                    title={icon.label}
                  >
                    {icon.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Selection */}
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Color
              </Label>
              <div className="flex flex-wrap gap-2">
                {goalColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-10 h-10 rounded-lg transition-all ${
                      selectedColor === color ? "ring-2 ring-offset-2 ring-ring-coral" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Target Amount */}
            <div className="space-y-2">
              <Label htmlFor="targetAmount" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Target Amount
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
                <Input
                  id="targetAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  required
                  disabled={saving}
                  className="pl-7 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
            </div>

            {/* Current Amount */}
            <div className="space-y-2">
              <Label htmlFor="currentAmount" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Current Amount
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
                <Input
                  id="currentAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  required
                  disabled={saving}
                  className="pl-7 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                />
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label htmlFor="deadline" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                Target Date (optional)
              </Label>
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={saving}
                min={new Date().toISOString().split("T")[0]}
                className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            {/* Linked Saver Account */}
            <div className="space-y-2">
              <Label className="font-[family-name:var(--font-nunito)] font-bold text-text-primary flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Link to UP Bank Saver (optional)
              </Label>
              <Select value={linkedAccountId} onValueChange={setLinkedAccountId} disabled={saving}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]">
                  <SelectValue placeholder="Select a saver account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (manual tracking)</SelectItem>
                  {saverAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.display_name} - ${(account.balance_cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
                Link this goal to an UP Bank Saver account to track balance automatically
              </p>
            </div>

            {/* Preview */}
            <div className="p-4 rounded-2xl border-2 border-info-border bg-secondary">
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-2">Preview</p>
              <div className="flex items-center gap-3">
                <div
                  className="p-3 rounded-xl text-2xl"
                  style={{ backgroundColor: `${selectedColor}20` }}
                >
                  {goalIcons.find(i => i.id === selectedIcon)?.emoji}
                </div>
                <div>
                  <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                    {name || "Your Goal"}
                  </p>
                  <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: selectedColor }}>
                    ${currentAmount || "0"} / ${targetAmount || "0"}
                  </p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                type="submit"
                className="flex-1 h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={saving}
                className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
