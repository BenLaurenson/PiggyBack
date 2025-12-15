"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { fetchInvestmentPrice, fetchMultipleCryptoPrices } from "@/lib/price-apis";
import { demoActionGuard } from "@/lib/demo-guard";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { upsertInvestmentNetWorth } from "@/lib/net-worth-helpers";

export async function createInvestment(data: {
  asset_type: "stock" | "etf" | "crypto" | "property" | "other";
  name: string;
  ticker_symbol?: string;
  quantity?: number;
  purchase_value_cents?: number;
  current_value_cents: number;
  notes?: string;
}) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Get user's partnership (auto-creates if missing)
  const partnershipId = await getUserPartnershipId(supabase, user.id);

  if (!partnershipId) {
    return { error: "Could not find or create budget" };
  }

  const { data: investment, error } = await supabase
    .from("investments")
    .insert({
      partnership_id: partnershipId,
      ...data,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Create initial history entry
  if (investment) {
    await supabase
      .from("investment_history")
      .insert({
        investment_id: investment.id,
        value_cents: data.current_value_cents,
      });
  }

  revalidatePath("/invest");
  return { success: true, data: investment };
}

export async function updateInvestment(investmentId: string, data: {
  asset_type: string;
  name: string;
  ticker_symbol?: string;
  quantity?: number;
  purchase_value_cents?: number;
  current_value_cents: number;
  notes?: string;
}) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Get the current investment to check if value changed
  const { data: currentInvestment } = await supabase
    .from("investments")
    .select("current_value_cents")
    .eq("id", investmentId)
    .maybeSingle();

  // Update investment
  const { error: updateError } = await supabase
    .from("investments")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", investmentId);

  if (updateError) {
    return { error: updateError.message };
  }

  // If value changed, add to history
  if (currentInvestment && currentInvestment.current_value_cents !== data.current_value_cents) {
    await supabase
      .from("investment_history")
      .insert({
        investment_id: investmentId,
        value_cents: data.current_value_cents,
      });
  }

  revalidatePath("/invest");
  return { success: true };
}

export async function deleteInvestment(investmentId: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("investments")
    .delete()
    .eq("id", investmentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/invest");
  return { success: true };
}

export async function updateInvestmentPriceFromAPI(investmentId: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Get investment details
  const { data: investment, error: fetchError } = await supabase
    .from("investments")
    .select("asset_type, ticker_symbol, quantity, name")
    .eq("id", investmentId)
    .maybeSingle();

  if (fetchError || !investment) {
    return { error: "Investment not found" };
  }

  if (!investment.ticker_symbol) {
    return { error: "No ticker symbol set - cannot fetch price" };
  }

  // Fetch price from API
  const result = await fetchInvestmentPrice(
    investment.asset_type,
    investment.ticker_symbol,
    investment.quantity,
  );

  if (!result) {
    return { error: "Failed to fetch price from API. Check ticker symbol and try again." };
  }

  // Update investment
  const { error: updateError } = await supabase
    .from("investments")
    .update({
      current_value_cents: result.valueCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", investmentId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Add to history
  await supabase
    .from("investment_history")
    .insert({
      investment_id: investmentId,
      value_cents: result.valueCents,
    });

  // Update net worth snapshot with new investment total
  const { data: inv } = await supabase
    .from("investments")
    .select("partnership_id")
    .eq("id", investmentId)
    .maybeSingle();
  if (inv?.partnership_id) {
    await upsertInvestmentNetWorth(supabase, inv.partnership_id);
  }

  revalidatePath("/invest");
  return {
    success: true,
    price: result.priceData.price,
    change: result.priceData.changePercent,
    source: result.priceData.source,
  };
}

export async function logInvestmentContribution(
  investmentId: string,
  amountCents: number,
  contributedAt: string,
  notes?: string
) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) {
    return { error: "Could not find partnership" };
  }

  // Verify the investment belongs to this partnership
  const { data: investment } = await supabase
    .from("investments")
    .select("id, partnership_id")
    .eq("id", investmentId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!investment) {
    return { error: "Investment not found" };
  }

  const { error } = await supabase
    .from("investment_contributions")
    .insert({
      investment_id: investmentId,
      partnership_id: partnershipId,
      amount_cents: amountCents,
      contributed_at: contributedAt,
      notes: notes || null,
    });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/budget");
  revalidatePath("/invest");
  return { success: true };
}

export async function refreshAllPrices() {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "Could not find partnership" };

  // Fetch all investments with ticker symbols
  const { data: investments } = await supabase
    .from("investments")
    .select("id, asset_type, ticker_symbol, quantity, name")
    .eq("partnership_id", partnershipId)
    .not("ticker_symbol", "is", null);

  if (!investments || investments.length === 0) {
    return { refreshed: 0, errors: [] };
  }

  // Separate crypto (CoinGecko batch) from stocks/ETFs (Yahoo Finance)
  const cryptoInvestments = investments.filter((i) => i.asset_type === "crypto");
  const stockInvestments = investments.filter((i) => i.asset_type === "stock" || i.asset_type === "etf");

  let refreshed = 0;
  const errors: string[] = [];

  // Batch crypto via CoinGecko (single API call for all)
  if (cryptoInvestments.length > 0) {
    const symbols = cryptoInvestments.map((i) => i.ticker_symbol!);
    const prices = await fetchMultipleCryptoPrices(symbols);

    for (const inv of cryptoInvestments) {
      const priceData = prices.get(inv.ticker_symbol!.toUpperCase());
      if (priceData) {
        const totalValue = inv.quantity ? priceData.price * inv.quantity : priceData.price;
        const valueCents = Math.round(totalValue * 100);

        await supabase
          .from("investments")
          .update({ current_value_cents: valueCents, updated_at: new Date().toISOString() })
          .eq("id", inv.id);

        await supabase
          .from("investment_history")
          .insert({ investment_id: inv.id, value_cents: valueCents });

        refreshed++;
      } else {
        errors.push(`${inv.name}: price not found`);
      }
    }
  }

  // Stock/ETF refreshes via Yahoo Finance (free, no rate limit)
  for (const inv of stockInvestments) {
    const result = await fetchInvestmentPrice(
      inv.asset_type,
      inv.ticker_symbol,
      inv.quantity,
    );

    if (result) {
      await supabase
        .from("investments")
        .update({ current_value_cents: result.valueCents, updated_at: new Date().toISOString() })
        .eq("id", inv.id);

      await supabase
        .from("investment_history")
        .insert({ investment_id: inv.id, value_cents: result.valueCents });

      refreshed++;
    } else {
      errors.push(`${inv.name}: failed to fetch price`);
    }
  }

  // Update net worth snapshot
  await upsertInvestmentNetWorth(supabase, partnershipId);

  revalidatePath("/invest");
  return { refreshed, errors };
}
