import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Phase 4 funnel: tenant_provisioning_started fires once the user reaches
  // the onboarding wizard for the first time (before has_onboarded flips
  // to true). Idempotent because we only fire when has_onboarded === false.
  // Note: in the multi-tenant world this will move to a dedicated provisioning
  // route that runs *before* the user reaches the onboarding wizard.

  // Fetch profile and actual DB state in parallel to hydrate steps correctly
  const [
    { data: profile },
    { data: bankConfig },
    { count: accountCount },
    { count: incomeCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, has_onboarded, onboarding_steps_completed")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("up_api_configs")
      .select("is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("income_sources")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  if (profile && profile.has_onboarded === false) {
    // Fire-and-forget; the page render shouldn't block on it.
    void track(FunnelEvent.TENANT_PROVISIONING_STARTED, {
      userId: user.id,
      tenantId: user.id,
    });
  }

  // Merge stored steps with actual DB state (handles hard-refresh mid-onboarding)
  const storedSteps = profile?.onboarding_steps_completed || [];
  const hydratedSteps = [...storedSteps];

  if (profile?.display_name && !hydratedSteps.includes("profile")) {
    hydratedSteps.push("profile");
  }
  if (bankConfig?.is_active && !hydratedSteps.includes("bank")) {
    hydratedSteps.push("bank");
  }
  if ((incomeCount ?? 0) > 0 && !hydratedSteps.includes("income")) {
    hydratedSteps.push("income");
  }

  return (
    <OnboardingWizard
      userId={user.id}
      email={user.email || ""}
      existingDisplayName={profile?.display_name || ""}
      stepsCompleted={hydratedSteps}
      bankAccountCount={accountCount ?? 0}
    />
  );
}
