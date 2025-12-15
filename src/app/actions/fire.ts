"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";

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

  const { error } = await supabase
    .from("profiles")
    .update({
      ...data,
      fire_onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/plan");
  revalidatePath("/settings/fire");
  return { success: true };
}
