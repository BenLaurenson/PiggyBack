"use server";

import { createClient } from "@/utils/supabase/server";
import { demoActionGuard } from "@/lib/demo-guard";

export async function completeOnboarding(stepsCompleted: string[]) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("profiles")
    .update({
      has_onboarded: true,
      onboarded_at: new Date().toISOString(),
      onboarding_steps_completed: stepsCompleted,
    })
    .eq("id", user.id);
}
