import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin-auth";

/**
 * Admin layout. Gates all `/admin/*` routes behind the ADMIN_EMAILS
 * allowlist. Unauthenticated users redirect to /login; authenticated
 * but non-admin users get a hard 404 to avoid leaking the existence of
 * admin pages.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!isAdminEmail(user.email ?? null)) {
    // Don't reveal admin route existence to non-admins.
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return <>{children}</>;
}
