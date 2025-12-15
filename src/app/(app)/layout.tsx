import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Nunito, DM_Sans } from "next/font/google";
import { Sidebar, BottomNav, AppHeader } from "@/components/navigation";
import { PiggyChatWrapper } from "@/components/ai/piggy-chat-wrapper";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { DemoBanner } from "@/components/demo/demo-banner";
import { AuthStateListener } from "@/components/auth/auth-state-listener";
import { ConnectionStatusProvider } from "@/contexts/connection-status-context";
import { isDemoMode } from "@/lib/demo-guard";
import { getUserPartnershipId } from "@/lib/get-user-partnership";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile, account status, and partnership ID in parallel
  const [{ data: profile }, { count: accountCount }, partnershipId] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true),
    getUserPartnershipId(supabase, user.id),
  ]);

  const hasAccounts = (accountCount ?? 0) > 0;

  // Feature flag queries (partnership-dependent, skip if no partnership)
  let goalsCount = 0, completedGoalsCount = 0, incomeCount = 0, investmentsCount = 0, snapshotsCount = 0;
  if (partnershipId) {
    const [goals, completed, income, investments, snapshots] = await Promise.all([
      supabase.from("savings_goals").select("*", { count: "exact", head: true })
        .eq("partnership_id", partnershipId).eq("is_completed", false),
      supabase.from("savings_goals").select("*", { count: "exact", head: true })
        .eq("partnership_id", partnershipId).eq("is_completed", true),
      supabase.from("income_sources").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("is_active", true)
        .eq("source_type", "recurring-salary").eq("is_manual_partner_income", false),
      supabase.from("investments").select("*", { count: "exact", head: true })
        .eq("partnership_id", partnershipId),
      supabase.from("net_worth_snapshots").select("*", { count: "exact", head: true })
        .eq("partnership_id", partnershipId),
    ]);
    goalsCount = goals.count ?? 0;
    completedGoalsCount = completed.count ?? 0;
    incomeCount = income.count ?? 0;
    investmentsCount = investments.count ?? 0;
    snapshotsCount = snapshots.count ?? 0;
  }

  const userData = {
    email: user.email,
    display_name: profile?.display_name || user.user_metadata?.display_name,
    avatar_url: profile?.avatar_url,
  };

  return (
    <ThemeProvider defaultTheme={profile?.theme_preference || "mint"}>
        <ConnectionStatusProvider
          hasAccounts={hasAccounts}
          hasGoals={goalsCount > 0}
          hasCompletedGoals={completedGoalsCount > 0}
          hasPayday={incomeCount > 0}
          fireOnboarded={profile?.fire_onboarded === true && !!profile?.date_of_birth}
          hasInvestments={investmentsCount > 0}
          hasNetWorthData={snapshotsCount >= 2}
        >
          <div className={`min-h-screen bg-background ${nunito.variable} ${dmSans.variable}`}>
            {/* Auth state listener (session expiry, sign-out from another tab, etc.) */}
            <AuthStateListener />

            {/* Demo Mode Banner */}
            {isDemoMode() && <DemoBanner />}

            {/* Desktop Sidebar */}
            <Sidebar user={userData} demoMode={isDemoMode()} />

            {/* Mobile Header */}
            <AppHeader user={userData} />

            {/* Main Content */}
            <main className="md:pl-64 pb-20 md:pb-0">
              {children}
            </main>

            {/* Mobile Bottom Navigation */}
            <BottomNav />

            {/* AI Chat Assistant */}
            <PiggyChatWrapper />

            {/* Global Toast Notifications */}
            <Toaster />
          </div>
        </ConnectionStatusProvider>
    </ThemeProvider>
  );
}
