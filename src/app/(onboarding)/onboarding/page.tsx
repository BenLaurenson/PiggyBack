import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

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
