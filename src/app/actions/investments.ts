"use server";

import { z } from "zod/v4";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { fetchInvestmentPrice, fetchMultipleCryptoPrices } from "@/lib/price-apis";
import { demoActionGuard } from "@/lib/demo-guard";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { upsertInvestmentNetWorth } from "@/lib/net-worth-helpers";
import { safeErrorMessage } from "@/lib/safe-error";

// =====================================================
// ZOD SCHEMAS
// =====================================================

const assetTypeSchema = z.enum(["stock", "etf", "crypto", "property", "other"]);

const createInvestmentSchema = z.object({
  asset_type: assetTypeSchema,
  name: z.string().min(1).max(200),
  ticker_symbol: z.string().max(20).optional(),
  quantity: z.number().min(0).max(1_000_000_000).optional(),
  purchase_value_cents: z.number().int().min(0).max(100_000_000_000_00).optional(), // max $100B in cents
  current_value_cents: z.number().int().min(0).max(100_000_000_000_00),
  notes: z.string().max(1000).optional(),
});

const updateInvestmentSchema = z.object({
  asset_type: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  ticker_symbol: z.string().max(20).optional(),
  quantity: z.number().min(0).max(1_000_000_000).optional(),
  purchase_value_cents: z.number().int().min(0).max(100_000_000_000_00).optional(),
  current_value_cents: z.number().int().min(0).max(100_000_000_000_00),
  notes: z.string().max(1000).optional(),
});

export async function createInvestment(data: {
  asset_type: "stock" | "etf" | "crypto" | "property" | "other";
  name: string;
  ticker_symbol?: string;
  quantity?: number;
  purchase_value_cents?: number;
  current_value_cents: number;
  notes?: string;
}) {
  const parsed = createInvestmentSchema.safeParse(data);
  if (!parsed.success) return { error: "Invalid input: " + parsed.error.issues.map(i => i.message).join(", ") };
  data = parsed.data;

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

  // Validate financial amounts
  if (data.current_value_cents !== undefined && (!Number.isFinite(data.current_value_cents) || data.current_value_cents < 0)) {
    return { error: "Invalid current value" };
  }
  if (data.purchase_value_cents !== undefined && (!Number.isFinite(data.purchase_value_cents) || data.purchase_value_cents < 0)) {
    return { error: "Invalid purchase value" };
  }

  const { data: investment, error } = await supabase
    .from("investments")
    .insert({
      partnership_id: partnershipId,
      asset_type: data.asset_type,
      name: data.name,
      ticker_symbol: data.ticker_symbol,
      quantity: data.quantity,
      purchase_value_cents: data.purchase_value_cents,
      current_value_cents: data.current_value_cents,
      notes: data.notes,
    })
    .select()
    .single();

  if (error) {
    return { error: safeErrorMessage(error, "Failed to create investment") };
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
  const idParsed = z.string().uuid().safeParse(investmentId);
  if (!idParsed.success) return { error: "Invalid investment ID" };
  const dataParsed = updateInvestmentSchema.safeParse(data);
  if (!dataParsed.success) return { error: "Invalid input: " + dataParsed.error.issues.map(i => i.message).join(", ") };
  data = dataParsed.data;

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

  // Validate financial amounts
  if (data.current_value_cents !== undefined && (!Number.isFinite(data.current_value_cents) || data.current_value_cents < 0)) {
    return { error: "Invalid current value" };
  }
  if (data.purchase_value_cents !== undefined && (!Number.isFinite(data.purchase_value_cents) || data.purchase_value_cents < 0)) {
    return { error: "Invalid purchase value" };
  }

  // Get the current investment — verify ownership via partnership_id
  const { data: currentInvestment } = await supabase
    .from("investments")
    .select("current_value_cents")
    .eq("id", investmentId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!currentInvestment) {
    return { error: "Investment not found" };
  }

  // Update investment — explicit fields only, no spread from user input
  const { error: updateError } = await supabase
    .from("investments")
    .update({
      asset_type: data.asset_type,
      name: data.name,
      ticker_symbol: data.ticker_symbol,
      quantity: data.quantity,
      purchase_value_cents: data.purchase_value_cents,
      current_value_cents: data.current_value_cents,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", investmentId)
    .eq("partnership_id", partnershipId);

  if (updateError) {
    return { error: safeErrorMessage(updateError, "Failed to update investment") };
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
  const idParsed = z.string().uuid().safeParse(investmentId);
  if (!idParsed.success) return { error: "Invalid investment ID" };

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

  // Verify ownership before deleting
  const { data: existing } = await supabase
    .from("investments")
    .select("id")
    .eq("id", investmentId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!existing) {
    return { error: "Investment not found" };
  }

  const { error } = await supabase
    .from("investments")
    .delete()
    .eq("id", investmentId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to delete investment") };
  }

  revalidatePath("/invest");
  return { success: true };
}

export async function updateInvestmentPriceFromAPI(investmentId: string) {
  const idParsed = z.string().uuid().safeParse(investmentId);
  if (!idParsed.success) return { error: "Invalid investment ID" };

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

  // Get investment details — verify ownership via partnership_id
  const { data: investment, error: fetchError } = await supabase
    .from("investments")
    .select("asset_type, ticker_symbol, quantity, name, partnership_id")
    .eq("id", investmentId)
    .eq("partnership_id", partnershipId)
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

  // Update investment — scoped to partnership
  const { error: updateError } = await supabase
    .from("investments")
    .update({
      current_value_cents: result.valueCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", investmentId)
    .eq("partnership_id", partnershipId);

  if (updateError) {
    return { error: safeErrorMessage(updateError, "Failed to update investment price") };
  }

  // Add to history
  await supabase
    .from("investment_history")
    .insert({
      investment_id: investmentId,
      value_cents: result.valueCents,
    });

  // Update net worth snapshot with new investment total
  await upsertInvestmentNetWorth(supabase, partnershipId);

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
  const idParsed = z.string().uuid().safeParse(investmentId);
  if (!idParsed.success) return { error: "Invalid investment ID" };
  const amountParsed = z.number().int().min(1).max(100_000_000_000_00).safeParse(amountCents);
  if (!amountParsed.success) return { error: "Invalid amount" };
  const dateParsed = z.string().min(1).max(50).safeParse(contributedAt);
  if (!dateParsed.success) return { error: "Invalid date" };
  const notesParsed = z.string().max(1000).optional().safeParse(notes);
  if (!notesParsed.success) return { error: "Invalid notes" };

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

  // Validate financial amount
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { error: "Invalid amount" };
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
    return { error: safeErrorMessage(error, "Failed to log investment contribution") };
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
