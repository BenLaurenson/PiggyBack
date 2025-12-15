import { cache } from "react";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Robustly gets the user's partnership_id.
 * Wrapped in React.cache() to deduplicate calls within the same render
 * (layout.tsx + page.tsx both call this per navigation).
 */
export const getUserPartnershipId = cache(async (
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> => {
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return membership?.partnership_id ?? null;
});
