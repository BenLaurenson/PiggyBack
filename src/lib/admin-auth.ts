/**
 * Admin auth helpers.
 *
 * The ADMIN_EMAILS env var is a comma-separated allowlist of email
 * addresses that are permitted to access admin-only routes (e.g.
 * `/admin/merchant-rules`). Email matching is case-insensitive.
 *
 * Set in `.env.local`:
 *   ADMIN_EMAILS="ben@example.com,co-admin@example.com"
 */

export function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
}
