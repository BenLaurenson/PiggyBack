import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";
import type { OnboardingState } from "@/app/actions/onboarding";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The wizard is now a thin renderer over the BE state machine. We only
  // need the user's display name (to prefill the profile step) + the bank
  // account count (so the BANK step's "looks like you started syncing
  // earlier — continue?" pickup banner can fire if state still says BANK
  // but accounts already exist).
  const [{ data: profile }, { count: accountCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, has_onboarded, onboarding_state")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  // Already-onboarded users go straight to /home — onboarding is a setup
  // flow, not a settings page.
  if (profile?.has_onboarded === true || profile?.onboarding_state === "READY") {
    redirect("/home");
  }

  if (profile && profile.has_onboarded === false) {
    void track(FunnelEvent.TENANT_PROVISIONING_STARTED, {
      userId: user.id,
      tenantId: user.id,
    });
  }

  // Default to PROFILE if the row somehow got created without a state. The
  // migration guarantees a value, but be defensive.
  const initialState = (profile?.onboarding_state as OnboardingState | undefined) ?? "PROFILE";

  return (
    <OnboardingWizard
      userId={user.id}
      email={user.email || ""}
      existingDisplayName={profile?.display_name || ""}
      initialState={initialState}
      bankAccountCount={accountCount ?? 0}
    />
  );
}
