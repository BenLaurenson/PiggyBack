import { redirect, notFound } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/admin-auth";

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
  const auth = await isCurrentUserAdmin();

  if (!auth.userId) {
    redirect("/login");
  }
  if (!auth.isAdmin) {
    notFound();
  }

  return <>{children}</>;
}
