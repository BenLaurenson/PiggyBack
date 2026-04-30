/**
 * Hosted-platform admin console.
 *
 * Auth gate: ADMIN_EMAILS env var (comma-separated). If the signed-in user's
 * email isn't on the list, we 404 (don't even reveal the page exists).
 *
 * Surfaces:
 *   - Per-provision state, subscription status, last sync, deployment URL.
 *   - Buttons: redeploy, run pending migrations, view webhook delivery logs.
 *   - Filter by state (e.g., "show only stuck FAILED").
 */

import { notFound } from "next/navigation";
import { Nunito, DM_Sans } from "next/font/google";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { AdminClient } from "./admin-client";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"],
});

export const metadata = { title: "Admin — PiggyBack" };

function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) notFound();
  const allowed = adminEmails();
  if (!allowed.includes(user.email.toLowerCase())) notFound();

  const service = createServiceRoleClient();
  const { data: provisions } = await service
    .from("piggyback_provisions")
    .select(
      "id, email, display_name, state, state_detail, state_updated_at, subdomain_short_id, subdomain_vanity, supabase_project_ref, vercel_project_id, vercel_deployment_url, subscription_status, subdomain_teardown_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: health } = await service
    .from("provision_health_checks")
    .select("provision_id, last_status_code, last_response_time_ms, consecutive_failures, last_checked_at, last_error");

  const healthMap = new Map((health ?? []).map((h: any) => [h.provision_id, h]));

  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <section className="pt-12 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black text-text-primary mb-2">
            Hosted users
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-8">
            {(provisions ?? []).length} provision{(provisions ?? []).length === 1 ? "" : "s"} ·
            most recent first
          </p>

          <AdminClient
            provisions={(provisions ?? []).map((p: any) => ({
              ...p,
              health: healthMap.get(p.id) ?? null,
            }))}
          />
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
