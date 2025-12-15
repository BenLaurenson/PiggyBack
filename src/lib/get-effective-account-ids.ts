import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get effective account IDs for budget calculations, handling JOINT account deduplication.
 *
 * When both partners sync the same JOINT (2Up) account, each gets separate
 * account + transaction rows. In "shared" view, we deduplicate by including
 * only ONE user's account row per JOINT up_account_id (deterministic: earliest
 * user_id alphabetically wins).
 *
 * In "individual" view, only the current user's accounts are returned (no dedup needed).
 */
export async function getEffectiveAccountIds(
  supabase: SupabaseClient,
  partnershipId: string,
  userId: string,
  view: "individual" | "shared"
): Promise<string[]> {
  // Get all partnership members
  const { data: members } = await supabase
    .from("partnership_members")
    .select("user_id")
    .eq("partnership_id", partnershipId);

  const userIds = members?.map((m) => m.user_id) || [];

  if (view === "individual") {
    // Individual view: only current user's accounts
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true);

    return accounts?.map((a) => a.id) || [];
  }

  // Shared view: all members' accounts, with JOINT deduplication
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id, up_account_id, ownership_type")
    .in("user_id", userIds)
    .eq("is_active", true);

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
