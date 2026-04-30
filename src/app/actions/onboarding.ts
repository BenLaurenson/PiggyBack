"use server";

import { createClient } from "@/utils/supabase/server";
import { demoActionGuard } from "@/lib/demo-guard";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

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
