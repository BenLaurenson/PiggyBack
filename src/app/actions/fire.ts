"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";

export async function updateFireProfile(data: {
  date_of_birth: string | null;
  target_retirement_age: number | null;
  super_balance_cents: number;
  super_contribution_rate: number;
  expected_return_rate: number;
  outside_super_return_rate: number | null;
  income_growth_rate: number;
  spending_growth_rate: number;
  fire_variant: "lean" | "regular" | "fat" | "coast";
  annual_expense_override_cents: number | null;
}) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate numeric fields
  if (data.super_balance_cents !== undefined && !Number.isFinite(data.super_balance_cents)) {
    return { error: "Invalid super balance amount" };
  }
  if (data.super_contribution_rate !== undefined && !Number.isFinite(data.super_contribution_rate)) {
    return { error: "Invalid super contribution rate" };
  }
  if (data.expected_return_rate !== undefined && !Number.isFinite(data.expected_return_rate)) {
    return { error: "Invalid expected return rate" };
  }
  if (data.outside_super_return_rate !== undefined && data.outside_super_return_rate !== null && !Number.isFinite(data.outside_super_return_rate)) {
    return { error: "Invalid outside super return rate" };
  }
  if (data.income_growth_rate !== undefined && !Number.isFinite(data.income_growth_rate)) {
    return { error: "Invalid income growth rate" };
  }
  if (data.spending_growth_rate !== undefined && !Number.isFinite(data.spending_growth_rate)) {
    return { error: "Invalid spending growth rate" };
  }
  if (data.annual_expense_override_cents !== undefined && data.annual_expense_override_cents !== null && !Number.isFinite(data.annual_expense_override_cents)) {
    return { error: "Invalid annual expense override amount" };
  }

  // Destructure only expected fields — no spread
  const {
    date_of_birth,
    target_retirement_age,
    super_balance_cents,
    super_contribution_rate,
    expected_return_rate,
    outside_super_return_rate,
    income_growth_rate,
    spending_growth_rate,
    fire_variant,
    annual_expense_override_cents,
  } = data;

  const { error } = await supabase
    .from("profiles")
    .update({
      date_of_birth,
      target_retirement_age,
      super_balance_cents,
      super_contribution_rate,
      expected_return_rate,
      outside_super_return_rate,
      income_growth_rate,
      spending_growth_rate,
      fire_variant,
      annual_expense_override_cents,
      fire_onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to save FIRE settings") };
  }

  revalidatePath("/plan");
  revalidatePath("/settings/fire");
  return { success: true };
}
