import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/admin-auth";

/**
 * /admin/* gate. Redirects non-admins to /home. The admin allow-list is
 * controlled by the ADMIN_EMAILS env var.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await isCurrentUserAdmin();
  if (!auth.isAdmin) {
    redirect("/home");
  }
  return <>{children}</>;
}
