"use server";

/**
 * Server actions for `activity_overrides` — generic per-transaction display
 * tweaks that survive webhook re-syncs.
 *
 * Schema (see migrations/20260429000002_hosted_platform_aux.sql):
 *   merchant_display_name : rename the merchant in the activity list
 *   subtitle              : second-line note shown under the merchant
 *   exclude_from_budget   : drop from budget spent total (still visible in activity)
 *   exclude_from_net_worth: drop from net-worth aggregation
 *   custom_color, custom_emoji : visual tweaks
 *
 * Distinct from:
 *   transaction_category_overrides — category re-mapping
 *   transaction_share_overrides    — partner-share re-allocation
 *   transaction_notes              — markdown notes shared with partner
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";

export interface ActivityOverrideInput {
  transactionId: string;
  merchantDisplayName?: string | null;
  subtitle?: string | null;
  excludeFromBudget?: boolean | null;
  excludeFromNetWorth?: boolean | null;
  customColor?: string | null;
  customEmoji?: string | null;
}

export interface ActivityOverrideResult {
  success?: boolean;
  error?: string;
}

/**
 * Insert or update an activity_overrides row. Pass `null` for any field to
 * clear that specific override (revert to bank value).
 */
export async function upsertActivityOverride(
  input: ActivityOverrideInput
): Promise<ActivityOverrideResult> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!input.transactionId) return { error: "transactionId is required" };

    // Verify the user actually owns the transaction (RLS would catch this too,
    // but a clean error is friendlier than a silent no-op).
    const { data: txn } = await supabase
      .from("transactions")
      .select("id, accounts(user_id)")
      .eq("id", input.transactionId)
      .maybeSingle();
    if (!txn) return { error: "Transaction not found" };

    // If every override field is null/undefined, treat as a delete instead.
    const allNull =
      (input.merchantDisplayName ?? null) === null &&
      (input.subtitle ?? null) === null &&
      (input.excludeFromBudget ?? null) === null &&
      (input.excludeFromNetWorth ?? null) === null &&
      (input.customColor ?? null) === null &&
      (input.customEmoji ?? null) === null;

    if (allNull) {
      const { error } = await supabase
        .from("activity_overrides")
        .delete()
        .eq("transaction_id", input.transactionId)
        .eq("user_id", user.id);
      if (error) return { error: safeErrorMessage(error, "Failed to clear override") };
    } else {
      const { error } = await supabase.from("activity_overrides").upsert(
        {
          transaction_id: input.transactionId,
          user_id: user.id,
          merchant_display_name: input.merchantDisplayName ?? null,
          subtitle: input.subtitle ?? null,
          exclude_from_budget: input.excludeFromBudget ?? null,
          exclude_from_net_worth: input.excludeFromNetWorth ?? null,
          custom_color: input.customColor ?? null,
          custom_emoji: input.customEmoji ?? null,
        },
        { onConflict: "transaction_id" }
      );
      if (error) return { error: safeErrorMessage(error, "Failed to save override") };
    }

    revalidatePath("/activity");
    revalidatePath("/budget");
    revalidatePath("/home");

    return { success: true };
  } catch (error) {
    return { error: safeErrorMessage(error, "Failed to save override") };
  }
}

export async function deleteActivityOverride(
  transactionId: string
): Promise<ActivityOverrideResult> {
  return upsertActivityOverride({
    transactionId,
    merchantDisplayName: null,
    subtitle: null,
    excludeFromBudget: null,
    excludeFromNetWorth: null,
    customColor: null,
    customEmoji: null,
  });
}
