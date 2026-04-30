"use server";

import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";

// =====================================================
// SCHEMAS
// =====================================================

const frequencySchema = z.enum([
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
]);

const baseSchema = z.object({
  asset_id: z.string().uuid(),
  amount_cents: z.number().int().min(1).max(100_000_000_000), // up to $1B (cents)
  frequency: frequencySchema,
  anchor_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  // Trim, normalise to upper-case at the DB layer? We keep the user's
  // original casing so it shows nicely in the UI; the matcher in the
  // webhook is case-insensitive (ilike).
  merchant_pattern: z.string().min(2).max(120),
  is_active: z.boolean().optional(),
});

const updateSchema = baseSchema.partial();

// =====================================================
// CREATE
// =====================================================

export async function createRecurringInvestment(input: z.infer<typeof baseSchema>) {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input: " + parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const data = parsed.data;

  const blocked = demoActionGuard();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "Could not find partnership" };

  // Verify the asset belongs to this partnership.
  const { data: asset, error: assetErr } = await supabase
    .from("investments")
    .select("id")
    .eq("id", data.asset_id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();
  if (assetErr || !asset) return { error: "Investment not found" };

  const { data: rule, error } = await supabase
    .from("recurring_investments")
    .insert({
      partnership_id: partnershipId,
      asset_id: data.asset_id,
      amount_cents: data.amount_cents,
      frequency: data.frequency,
      anchor_date: data.anchor_date,
      merchant_pattern: data.merchant_pattern.trim(),
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return { error: safeErrorMessage(error, "Failed to create recurring investment") };
  }

  revalidatePath("/invest");
  return { success: true, data: rule };
}

// =====================================================
// UPDATE
// =====================================================

export async function updateRecurringInvestment(
  ruleId: string,
  input: z.infer<typeof updateSchema>
) {
  const idParsed = z.string().uuid().safeParse(ruleId);
  if (!idParsed.success) return { error: "Invalid rule ID" };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input: " + parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const data = parsed.data;

  const blocked = demoActionGuard();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "Could not find partnership" };

  // Verify ownership.
  const { data: existing } = await supabase
    .from("recurring_investments")
    .select("id")
    .eq("id", ruleId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();
  if (!existing) return { error: "Rule not found" };

  // If asset_id is being changed, verify it belongs to the partnership too.
  if (data.asset_id) {
    const { data: asset } = await supabase
      .from("investments")
      .select("id")
      .eq("id", data.asset_id)
      .eq("partnership_id", partnershipId)
      .maybeSingle();
    if (!asset) return { error: "Investment not found" };
  }

  const updatePayload: Record<string, unknown> = {};
  if (data.asset_id !== undefined) updatePayload.asset_id = data.asset_id;
  if (data.amount_cents !== undefined) updatePayload.amount_cents = data.amount_cents;
  if (data.frequency !== undefined) updatePayload.frequency = data.frequency;
  if (data.anchor_date !== undefined) updatePayload.anchor_date = data.anchor_date;
  if (data.merchant_pattern !== undefined)
    updatePayload.merchant_pattern = data.merchant_pattern.trim();
  if (data.is_active !== undefined) updatePayload.is_active = data.is_active;

  const { error } = await supabase
    .from("recurring_investments")
    .update(updatePayload)
    .eq("id", ruleId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to update recurring investment") };
  }

  revalidatePath("/invest");
  return { success: true };
}

// =====================================================
// DELETE
// =====================================================

export async function deleteRecurringInvestment(ruleId: string) {
  const idParsed = z.string().uuid().safeParse(ruleId);
  if (!idParsed.success) return { error: "Invalid rule ID" };

  const blocked = demoActionGuard();
  if (blocked) return blocked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "Could not find partnership" };

  const { error } = await supabase
    .from("recurring_investments")
    .delete()
    .eq("id", ruleId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to delete recurring investment") };
  }

  revalidatePath("/invest");
  return { success: true };
}

