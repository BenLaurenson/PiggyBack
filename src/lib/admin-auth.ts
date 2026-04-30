/**
 * Admin authentication helpers.
 *
 * The ADMIN_EMAILS env var is a comma-separated allowlist of email
 * addresses permitted to access admin-only routes (e.g.
 * `/admin/merchant-rules`, `/admin/funnel`). Email matching is
 * case-insensitive. If ADMIN_EMAILS is unset, no one is an admin
 * (fail-closed).
 *
 * Set in `.env.local`:
 *   ADMIN_EMAILS="email@benlaurenson.dev,co-admin@example.com"
 */

import { createClient } from "@/utils/supabase/server";

export interface AdminCheckResult {
  isAdmin: boolean;
  email: string | null;
  userId: string | null;
}

export function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Synchronous email check. Use when you already have the email in hand
 * (e.g. just resolved the user). For server components/API routes that
 * need to fetch the user, use `isCurrentUserAdmin()`.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
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
    const isAdmin = isAdminEmail(email);

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
