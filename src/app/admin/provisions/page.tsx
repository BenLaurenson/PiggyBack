/**
 * Admin provisions dashboard.
 *
 * Shows in-flight provisions with state badges + per-row retry/cancel actions.
 * Auth: ADMIN_EMAILS — same as /admin.
 */
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { ProvisionsClient } from "./provisions-client";

export const metadata = { title: "Provisions — Admin" };

function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function ProvisionsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    notFound();
  }

  const svc = createServiceRoleClient();
  const { data: rows } = await svc
    .from("piggyback_provisions")
    .select(
      "id, email, display_name, state, retry_count, next_retry_at, state_changed_at, subdomain_short_id, vercel_deployment_url"
    )
    .order("state_changed_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Provisions</h1>
      <ProvisionsClient initialRows={rows ?? []} />
    </div>
  );
}
