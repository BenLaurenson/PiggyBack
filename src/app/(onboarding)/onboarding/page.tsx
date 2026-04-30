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

  // If the user has already finished onboarding, send them straight to /home
  // instead of dropping them back into the wizard. Onboarding here is a
  // setup flow, not a settings page.
  if (profile?.has_onboarded === true) {
    redirect("/home");
  }

  if (profile && profile.has_onboarded === false) {
    // Phase 4 funnel: tenant_provisioning_started fires once the user reaches
    // the onboarding wizard for the first time. Fire-and-forget.
    void track(FunnelEvent.TENANT_PROVISIONING_STARTED, {
      userId: user.id,
      tenantId: user.id,
    });
  }

  // Merge stored steps with actual DB state (handles hard-refresh mid-onboarding
  // OR a closed tab — the wizard previously only persisted on Final Done click,
  // so DB-side reality is the authoritative signal of what's done).
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

  // Persist the hydrated steps back to the profile so subsequent renders
  // don't have to re-derive them (and so other parts of the app that look at
  // onboarding_steps_completed see the truth). Fire-and-forget — if it fails
  // we'll just re-derive next time.
  if (
    hydratedSteps.length > storedSteps.length ||
    hydratedSteps.some((s) => !storedSteps.includes(s))
  ) {
    void supabase
      .from("profiles")
      .update({ onboarding_steps_completed: hydratedSteps })
      .eq("id", user.id);
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
