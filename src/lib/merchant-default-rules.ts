/**
 * Merchant default rules service.
 *
 * Loads the global, admin-curated merchant -> category default mappings
 * from the `merchant_default_rules` table and exposes a fast lookup
 * helper plus a helper for recording when a rule was applied (for the
 * admin UI's "Last applied" column).
 *
 * The cache uses the service-role client so RLS can't strip rules from
 * the result set when called from server contexts that run as a regular
 * user (e.g. webhook -> sync flow).
 */

import { createServiceRoleClient } from "@/utils/supabase/service-role";

export interface MerchantDefaultRule {
  id: string;
  merchant_pattern: string;
  category_id: string;
  parent_category_id: string | null;
  source: "curated" | "user-suggested" | "promoted";
  is_active: boolean;
}

interface CacheEntry {
  loadedAt: number;
  rules: MerchantDefaultRule[];
  byPattern: Map<string, MerchantDefaultRule>;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: CacheEntry | null = null;

/**
 * Reset the in-process cache. Used by admin write endpoints after a
 * mutation, and by tests.
 */
export function invalidateMerchantDefaultRulesCache() {
  cache = null;
}

/**
 * Load active default rules. Cached in-process; refreshed every
 * CACHE_TTL_MS, or whenever `invalidateMerchantDefaultRulesCache` is
 * called (admin writes do this).
 */
export async function loadMerchantDefaultRules(): Promise<{
  rules: MerchantDefaultRule[];
  byPattern: Map<string, MerchantDefaultRule>;
}> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return { rules: cache.rules, byPattern: cache.byPattern };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("merchant_default_rules")
    .select("id, merchant_pattern, category_id, parent_category_id, source, is_active")
    .eq("is_active", true);

  if (error) {
    console.error("Failed to load merchant_default_rules:", error);
    // Return empty result; do NOT cache on error so we'll retry next call.
    return { rules: [], byPattern: new Map() };
  }

  const rules = (data || []) as MerchantDefaultRule[];
  const byPattern = new Map<string, MerchantDefaultRule>();
  for (const rule of rules) {
    byPattern.set(rule.merchant_pattern.toLowerCase(), rule);
  }

  cache = { loadedAt: now, rules, byPattern };
  return { rules, byPattern };
}

/**
 * Look up a default rule for a transaction description.
 * Performs an exact match on the lower-cased description against the
 * lower-cased pattern, then a substring match (description contains
 * pattern). The substring match wins only if the exact match is absent.
 */
export function findDefaultRuleForDescription(
  description: string,
  byPattern: Map<string, MerchantDefaultRule>
): MerchantDefaultRule | null {
  if (!description) return null;
  const lower = description.toLowerCase();

  // 1. Exact match
  const exact = byPattern.get(lower);
  if (exact) return exact;

  // 2. Substring match (e.g. description "Woolworths 1234 Sydney" matches
  //    pattern "Woolworths"). First/longest match wins.
  let bestMatch: MerchantDefaultRule | null = null;
  let bestLength = 0;
  for (const [pattern, rule] of byPattern.entries()) {
    if (pattern.length > bestLength && lower.includes(pattern)) {
      bestMatch = rule;
      bestLength = pattern.length;
    }
  }
  return bestMatch;
}

/**
 * Record the application of one or more default rules. Updates
 * `last_applied_at` and bumps `applied_count` via a SQL function so we
 * can do `applied_count = applied_count + n` in a single round-trip.
 *
 * Fire-and-forget: failure here should never block sync completion.
 */
export async function recordRuleApplications(ruleIdCounts: Map<string, number>) {
  if (ruleIdCounts.size === 0) return;
  try {
    const supabase = createServiceRoleClient();
    const payload = Array.from(ruleIdCounts.entries()).map(([id, count]) => ({
      rule_id: id,
      count,
    }));
    await supabase.rpc("increment_merchant_default_rule_applied", {
      p_payload: payload,
    });
  } catch (err) {
    console.error("Failed to record default-rule applications:", err);
  }
}
