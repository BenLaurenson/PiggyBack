/**
 * URL slug utilities for human-readable budget URLs.
 */

import crypto from "crypto";

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
 * Generate a short random hex suffix (4 chars = 65,536 possibilities).
 */
function randomSuffix(): string {
  return crypto.randomBytes(2).toString("hex");
}

/**
 * Generate a unique slug for a budget within a partnership.
 * Appends -2, -3, etc. if a collision is found among active budgets.
 * On the first collision, also appends a random suffix to prevent
 * concurrent requests from generating the same sequential slug.
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

  // Use counter + random suffix to avoid race conditions where two
  // concurrent requests both see the same "existing" set and pick
  // the same next counter value.
  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}-${randomSuffix()}`;
}

/**
 * Insert a row into user_budgets with automatic slug collision retry.
 *
 * If the insert fails with a unique constraint violation on the slug
 * (Postgres error 23505), regenerates the slug with a fresh random
 * suffix and retries up to `maxRetries` times.
 */
export async function insertBudgetWithSlugRetry(
  supabase: { from: (table: string) => any },
  row: Record<string, unknown>,
  partnershipId: string,
  name: string,
  excludeBudgetId?: string,
  maxRetries = 3
): Promise<{ data: Record<string, unknown> | null; error: unknown }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const slug =
      attempt === 0
        ? await generateUniqueSlug(supabase, partnershipId, name, excludeBudgetId)
        : `${slugify(name)}-${randomSuffix()}`;

    const { data, error } = await (supabase as any)
      .from("user_budgets")
      .insert({ ...row, slug })
      .select()
      .single();

    if (!error) {
      return { data, error: null };
    }

    // 23505 = unique_violation in Postgres
    if (error.code === "23505" && attempt < maxRetries) {
      lastError = error;
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: lastError };
}
