"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { fetchInvestmentPrice } from "@/lib/price-apis";
import { demoActionGuard } from "@/lib/demo-guard";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { safeErrorMessage } from "@/lib/safe-error";

export async function deleteWatchlistItem(id: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify the watchlist item belongs to the user's partnership
  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "No partnership found" };

  const { error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", id)
    .eq("partnership_id", partnershipId);
  if (error) return { error: safeErrorMessage(error, "Failed to delete watchlist item") };

  revalidatePath("/invest");
  return { success: true };
}

export async function refreshWatchlistPrice(id: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify the watchlist item belongs to the user's partnership
  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "No partnership found" };

  const { data: item } = await supabase
    .from("watchlist_items")
    .select("asset_type, ticker_symbol")
    .eq("id", id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!item?.ticker_symbol) return { error: "No ticker symbol" };

  const result = await fetchInvestmentPrice(
    item.asset_type,
    item.ticker_symbol,
    1, // quantity=1 to get unit price
  );

  if (!result) return { error: "Failed to fetch price" };

  const { error: updateError } = await supabase
    .from("watchlist_items")
    .update({
      last_price_cents: result.valueCents,
      last_price_updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("partnership_id", partnershipId);

  if (updateError) return { error: safeErrorMessage(updateError, "Failed to update watchlist price") };

  revalidatePath("/invest");
  return { success: true, price: result.priceData.price };
}
