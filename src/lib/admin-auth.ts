/**
 * Admin authentication helper.
 *
 * Used by /admin/* pages and /api/admin/* routes to gate access. The set of
 * admin emails is configured via the ADMIN_EMAILS env var, comma-separated.
 *
 *   ADMIN_EMAILS=email@benlaurenson.dev,team@example.com
 *
 * If ADMIN_EMAILS is unset, no one is an admin (fail-closed). Self-hosters
 * who want their own admin access just set this env var to their email.
 */

import { createClient } from "@/utils/supabase/server";

export interface AdminCheckResult {
  isAdmin: boolean;
  email: string | null;
  userId: string | null;
}

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Resolve the current user and check whether their email is in the
 * ADMIN_EMAILS allow-list. Returns isAdmin=false if there's no session.
 *
 * Never throws.
 */
export async function isCurrentUserAdmin(): Promise<AdminCheckResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email = user?.email?.toLowerCase() ?? null;
    const userId = user?.id ?? null;

    const allowed = getAdminEmails();
    const isAdmin = !!email && allowed.has(email);

    return { isAdmin, email, userId };
  } catch {
    return { isAdmin: false, email: null, userId: null };
  }
}

/**
 * Helper for tests / mocking. Returns the parsed allow-list.
 */
export function getConfiguredAdminEmails(): string[] {
  return Array.from(getAdminEmails());
}
