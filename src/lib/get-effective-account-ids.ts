import { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetScope } from "@/lib/budget-engine";

/**
 * Get effective account IDs for budget calculations, handling JOINT account deduplication.
 *
 * When both partners sync the same JOINT (2Up) account, each gets separate
 * account + transaction rows. In "shared" view, we deduplicate by including
 * only ONE user's account row per JOINT up_account_id (deterministic: earliest
 * user_id alphabetically wins).
 *
 * In "individual" view, only the current user's accounts are returned (no dedup needed).
 *
 * Optional `scope` (2Up budget toggle):
 *  - "personal":  filters to ownership_type='INDIVIDUAL' only.
 *  - "shared":    filters to ownership_type='JOINT' only (the 2Up account).
 *  - "combined":  no filter (default behaviour, matches the original API).
 *
 * The `view` parameter still determines whose accounts are visible in the first
 * place; `scope` is layered on top to refine that set by ownership type.
 */
export async function getEffectiveAccountIds(
  supabase: SupabaseClient,
  partnershipId: string,
  userId: string,
  view: "individual" | "shared",
  scope: BudgetScope = "combined"
): Promise<string[]> {
  // Get all partnership members
  const { data: members } = await supabase
    .from("partnership_members")
    .select("user_id")
    .eq("partnership_id", partnershipId);

  const userIds = members?.map((m) => m.user_id) || [];

  if (view === "individual") {
    // Individual view: only current user's accounts
    let query = supabase
      .from("accounts")
      .select("id, ownership_type")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (scope === "personal") query = query.eq("ownership_type", "INDIVIDUAL");
    else if (scope === "shared") query = query.eq("ownership_type", "JOINT");

    const { data: accounts } = await query;
    return accounts?.map((a) => a.id) || [];
  }

  // Shared view: all members' accounts, with JOINT deduplication
  let sharedQuery = supabase
    .from("accounts")
    .select("id, user_id, up_account_id, ownership_type")
    .in("user_id", userIds)
    .eq("is_active", true);

  if (scope === "personal") sharedQuery = sharedQuery.eq("ownership_type", "INDIVIDUAL");
  else if (scope === "shared") sharedQuery = sharedQuery.eq("ownership_type", "JOINT");

  const { data: accounts } = await sharedQuery;

  if (!accounts) return [];

  // Group JOINT accounts by up_account_id to detect duplicates
  const jointGroups = new Map<string, typeof accounts>();
  const result: string[] = [];

  for (const account of accounts) {
    if (account.ownership_type === "JOINT" && account.up_account_id) {
      const group = jointGroups.get(account.up_account_id) || [];
      group.push(account);
      jointGroups.set(account.up_account_id, group);
    } else {
      // Non-JOINT accounts always included
      result.push(account.id);
    }
  }

  // For each JOINT up_account_id, pick only one account row (earliest user_id)
  for (const [, group] of jointGroups) {
    const sorted = group.sort((a, b) => a.user_id.localeCompare(b.user_id));
    result.push(sorted[0].id);
  }

  return result;
}
