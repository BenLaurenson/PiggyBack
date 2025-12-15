"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Loader2, Target, Wallet } from "lucide-react";
import { useEffect } from "react";

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

export default function NewGoalPage() {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("piggy-bank");
  const [selectedColor, setSelectedColor] = useState(goalColors[0]);
  const [linkedAccountId, setLinkedAccountId] = useState<string>("none");
  const [saverAccounts, setSaverAccounts] = useState<Array<{ id: string; display_name: string; balance_cents: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Load saver accounts on mount
  useEffect(() => {
    async function loadSavers() {
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
    }
    loadSavers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user's partnership
      const { data: membership } = await supabase
        .from("partnership_members")
        .select("partnership_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) throw new Error("Please set up your budget first");

      const targetCents = Math.round(parseFloat(targetAmount) * 100);
      const currentCents = currentAmount ? Math.round(parseFloat(currentAmount) * 100) : 0;

      const { error: insertError } = await supabase
        .from("savings_goals")
        .insert({
          partnership_id: membership.partnership_id,
          name,
          target_amount_cents: targetCents,
          current_amount_cents: currentCents,
          deadline: deadline || null,
          icon: selectedIcon,
          color: selectedColor,
          linked_account_id: linkedAccountId !== "none" ? linkedAccountId : null,
        });

      if (insertError) throw insertError;

      router.push("/goals");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link href="/goals" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Goals
        </Link>
        <h1 className="text-2xl font-bold">Create New Goal</h1>
        <p className="text-muted-foreground">Set a savings goal to work towards together</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            {/* Goal Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Goal Name</Label>
              <Input
                id="name"
                placeholder="e.g., Holiday Fund, New Car, House Deposit"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Icon Selection */}
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {goalIcons.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    onClick={() => setSelectedIcon(icon.id)}
                    className={`p-3 rounded-lg text-2xl transition-all ${
                      selectedIcon === icon.id
                        ? "bg-primary/20 ring-2 ring-primary"
                        : "bg-muted hover:bg-muted/80"
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
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {goalColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-10 h-10 rounded-lg transition-all ${
                      selectedColor === color ? "ring-2 ring-offset-2 ring-primary" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Target Amount */}
            <div className="space-y-2">
              <Label htmlFor="targetAmount">Target Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="targetAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-7"
                />
              </div>
            </div>

            {/* Current Amount */}
            <div className="space-y-2">
              <Label htmlFor="currentAmount">Amount Already Saved (optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="currentAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  disabled={loading}
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                If you&apos;ve already started saving, enter the current amount
              </p>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label htmlFor="deadline">Target Date (optional)</Label>
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={loading}
                min={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-muted-foreground">
                When do you want to reach this goal?
              </p>
            </div>

            {/* Linked Saver Account */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Link to UP Bank Saver (optional)
              </Label>
              <Select value={linkedAccountId} onValueChange={setLinkedAccountId} disabled={loading}>
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                Link this goal to an UP Bank Saver account to track balance automatically
              </p>
            </div>

            {/* Preview */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <p className="text-sm text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-3">
                <div
                  className="p-3 rounded-xl text-2xl"
                  style={{ backgroundColor: `${selectedColor}20` }}
                >
                  {goalIcons.find(i => i.id === selectedIcon)?.emoji}
                </div>
                <div>
                  <p className="font-medium">{name || "Your Goal"}</p>
                  <p className="text-sm" style={{ color: selectedColor }}>
                    ${currentAmount || "0"} / ${targetAmount || "0"}
                  </p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4 mr-2" />
                    Create Goal
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
