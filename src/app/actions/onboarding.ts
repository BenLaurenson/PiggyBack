"use server";

import { createClient } from "@/utils/supabase/server";
import { demoActionGuard } from "@/lib/demo-guard";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

/**
 * Persist a single completed step to profiles.onboarding_steps_completed.
 * Fire-and-forget from the wizard so closing the tab mid-flow doesn't
 * lose progress. Idempotent — duplicates are deduped.
 */
export async function persistOnboardingStep(stepId: string) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_steps_completed")
    .eq("id", user.id)
    .maybeSingle();

  const existing: string[] = profile?.onboarding_steps_completed || [];
  if (existing.includes(stepId)) {
    return { ok: true };
  }
  const next = [...existing, stepId];
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_steps_completed: next })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}

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

  // Phase 4 funnel: tenant_ready fires the moment provisioning finishes.
  // From this point on, events are keyed by tenant_id (currently == user.id)
  // rather than the anonymous-session cookie.
  void track(FunnelEvent.TENANT_READY, {
    userId: user.id,
    tenantId: user.id,
    properties: {
      steps_completed: stepsCompleted,
    },
  });
}
