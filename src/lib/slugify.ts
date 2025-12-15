/**
 * URL slug utilities for human-readable budget URLs.
 */

/**
 * Convert a human-readable name to a URL-safe slug.
 * Matches the existing category slug pattern used throughout the codebase.
 *
 * Examples:
 *   "My 50/30/20 Budget" -> "my-503020-budget"
 *   "Food & Dining"      -> "food-and-dining"
 *   "Ben's Budget!"      -> "bens-budget"
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Truncate at 80 chars on a hyphen boundary
  if (slug.length > 80) {
    const truncated = slug.slice(0, 80);
    const lastHyphen = truncated.lastIndexOf("-");
    return lastHyphen > 20 ? truncated.slice(0, lastHyphen) : truncated;
  }

  return slug || "budget";
}

/**
 * Generate a unique slug for a budget within a partnership.
 * Appends -2, -3, etc. if a collision is found among active budgets.
 */
export async function generateUniqueSlug(
  supabase: { from: (table: string) => any },
  partnershipId: string,
  name: string,
  excludeBudgetId?: string
): Promise<string> {
  const baseSlug = slugify(name);

  let query = supabase
    .from("user_budgets")
    .select("slug")
    .eq("partnership_id", partnershipId)
    .eq("is_active", true)
    .like("slug", `${baseSlug}%`);

  if (excludeBudgetId) {
    query = query.neq("id", excludeBudgetId);
  }

  const { data: existing } = await query;
  const existingSlugs = new Set(
    (existing ?? []).map((r: { slug: string }) => r.slug)
  );

  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}
