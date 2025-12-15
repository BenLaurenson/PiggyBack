"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
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
  { id: "piggy-bank", emoji: "\u{1F437}", label: "Savings" },
  { id: "home", emoji: "\u{1F3E0}", label: "Home" },
  { id: "car", emoji: "\u{1F697}", label: "Car" },
  { id: "plane", emoji: "\u2708\uFE0F", label: "Travel" },
  { id: "gift", emoji: "\u{1F381}", label: "Gift" },
  { id: "heart", emoji: "\u2764\uFE0F", label: "Wedding" },
  { id: "ring", emoji: "\u{1F48D}", label: "Engagement" },
  { id: "baby", emoji: "\u{1F476}", label: "Baby" },
  { id: "star", emoji: "\u2B50", label: "Other" },
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

interface SaverAccount {
  id: string;
  display_name: string;
  balance_cents: number;
}

interface GoalData {
  id: string;
  name: string;
  target_amount_cents: number;
  current_amount_cents: number;
  deadline: string | null;
  icon: string;
  color: string;
  linked_account_id: string | null;
}

interface EditGoalClientProps {
  goal: GoalData;
  saverAccounts: SaverAccount[];
}

export function EditGoalClient({ goal, saverAccounts }: EditGoalClientProps) {
  const router = useRouter();

  const [name, setName] = useState(goal.name);
  const [targetAmount, setTargetAmount] = useState((goal.target_amount_cents / 100).toString());
  const [currentAmount, setCurrentAmount] = useState((goal.current_amount_cents / 100).toString());
  const [deadline, setDeadline] = useState(goal.deadline || "");
  const [selectedIcon, setSelectedIcon] = useState(goal.icon);
  const [selectedColor, setSelectedColor] = useState(goal.color);
  const [linkedAccountId, setLinkedAccountId] = useState<string>(goal.linked_account_id || "none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await updateGoal(goal.id, {
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
