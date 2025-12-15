import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, has_onboarded, onboarding_steps_completed")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <OnboardingWizard
      userId={user.id}
      email={user.email || ""}
      existingDisplayName={profile?.display_name || ""}
      stepsCompleted={profile?.onboarding_steps_completed || []}
    />
  );
}
