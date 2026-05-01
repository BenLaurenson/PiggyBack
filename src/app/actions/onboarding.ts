"use server";

import { createClient } from "@/utils/supabase/server";
import { demoActionGuard } from "@/lib/demo-guard";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

/**
 * Onboarding state machine — see
 * docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md
 *
 * The previous design persisted a `string[]` of completed step IDs and the
 * FE picked the next step from there. That gave us two sources of truth (the
 * array and the actual DB state) and bugs every time they disagreed. Now the
 * BE owns a single `profiles.onboarding_state` enum + an audit table. The
 * wizard becomes a thin renderer over that state.
 */

export const ONBOARDING_STATES = [
  "PROVISIONING",
  "PROFILE",
  "BANK",
  "INCOME",
  "AI",
  "PARTNER",
  "READY",
  "ABANDONED",
] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];

export type AdvanceResult =
  | { ok: true; currentState: OnboardingState }
  | { ok: false; currentState: OnboardingState; reason: string };

/**
 * Atomically advance from `fromState` to `toState`. Backed by the
 * `advance_onboarding_state` SQL function which uses a WHERE-based
 * optimistic-concurrency check — only one of two racing callers wins, the
 * loser gets back the actual current state and the FE reconciles.
 */
export async function advanceOnboardingState(
  fromState: OnboardingState,
  toState: OnboardingState,
  reason: string = "user_action",
): Promise<AdvanceResult> {
  const blocked = demoActionGuard();
  if (blocked) {
    return { ok: false, currentState: fromState, reason: "demo mode" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, currentState: fromState, reason: "not authenticated" };
  }

  const { data, error } = await supabase.rpc("advance_onboarding_state", {
    p_user_id: user.id,
    p_from: fromState,
    p_to: toState,
    p_reason: reason,
  });

  if (error || !data) {
    return {
      ok: false,
      currentState: fromState,
      reason: error?.message ?? "rpc failed",
    };
  }

  const currentState = data as OnboardingState;

  // Fire the tenant_ready funnel event the moment we transition into READY.
  // Idempotent at the DB level (only one transition wins), so this fires
  // exactly once per user.
  if (currentState === toState && toState === "READY") {
    void track(FunnelEvent.TENANT_READY, {
      userId: user.id,
      tenantId: user.id,
    });
    // Backwards-compat: keep `has_onboarded` + `onboarded_at` populated for
    // one release so any code still reading those fields keeps working.
    void supabase
      .from("profiles")
      .update({
        has_onboarded: true,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  if (currentState !== toState) {
    return { ok: false, currentState, reason: "state mismatch" };
  }
  return { ok: true, currentState };
}

/**
 * Read the current onboarding state for the signed-in user. Lightweight
 * helper for server components that need to decide what to render before
 * dispatching to the wizard.
 */
export async function getOnboardingState(): Promise<{
  state: OnboardingState;
  changedAt: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("onboarding_state, onboarding_state_changed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    state: (data.onboarding_state ?? "PROFILE") as OnboardingState,
    changedAt: data.onboarding_state_changed_at ?? null,
  };
}

/**
 * @deprecated Use {@link advanceOnboardingState}. Kept as a no-op stub so
 *   any straggler callers don't break during the rollout. Will be removed
 *   in the next release.
 */
export async function persistOnboardingStep(_stepId: string) {
  return { ok: true };
}

/**
 * @deprecated Use `advanceOnboardingState(currentState, 'READY')`. Kept as
 *   a thin compatibility shim — most callers already migrated.
 */
export async function completeOnboarding(_stepsCompleted?: string[]) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Force-set to READY (we don't know the prior state here). The wizard's
  // proper path goes through advanceOnboardingState; this exists only to
  // unblock pre-migration code paths.
  await supabase.rpc("force_set_onboarding_state", {
    p_user_id: user.id,
    p_to: "READY",
    p_reason: "user_action",
  });

  await supabase
    .from("profiles")
    .update({
      has_onboarded: true,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  void track(FunnelEvent.TENANT_READY, {
    userId: user.id,
    tenantId: user.id,
  });
}
