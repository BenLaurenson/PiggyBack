"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { fetchInvestmentPrice } from "@/lib/price-apis";
import { demoActionGuard } from "@/lib/demo-guard";
import { getUserPartnershipId } from "@/lib/get-user-partnership";

export async function deleteWatchlistItem(id: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/invest");
  return { success: true };
}

export async function refreshWatchlistPrice(id: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: item } = await supabase
    .from("watchlist_items")
    .select("asset_type, ticker_symbol")
    .eq("id", id)
    .maybeSingle();

  if (!item?.ticker_symbol) return { error: "No ticker symbol" };

  const result = await fetchInvestmentPrice(
    item.asset_type,
    item.ticker_symbol,
    1, // quantity=1 to get unit price
  );

  if (!result) return { error: "Failed to fetch price" };

  await supabase
    .from("watchlist_items")
    .update({
      last_price_cents: result.valueCents,
      last_price_updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/invest");
  return { success: true, price: result.priceData.price };
}
