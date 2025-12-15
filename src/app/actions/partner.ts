"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";
import { auditLog, AuditAction } from "@/lib/audit-logger";

// =====================================================
// MANUAL PARTNER (for partners who don't use the app)
// =====================================================

export interface ManualPartnerData {
  name: string;
  date_of_birth?: string | null;
  target_retirement_age?: number | null;
  super_balance_cents?: number;
  super_contribution_rate?: number;
}

/**
 * Save or update manual partner data on the user's partnership.
 * For users whose partner doesn't use PiggyBack.
 */
export async function saveManualPartner(data: ManualPartnerData) {
  const blocked = demoActionGuard(); if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: "No partnership found" };
  }

  const { error } = await supabase
    .from("partnerships")
    .update({
      manual_partner_name: data.name,
      manual_partner_dob: data.date_of_birth || null,
      manual_partner_target_retirement_age: data.target_retirement_age ?? null,
      manual_partner_super_balance_cents: data.super_balance_cents ?? 0,
      manual_partner_super_contribution_rate: data.super_contribution_rate ?? 11.5,
    })
    .eq("id", membership.partnership_id);

  if (error) {
    return { success: false, error: safeErrorMessage(error, "Failed to save manual partner") };
  }

  auditLog({
    userId: user.id,
    action: AuditAction.PARTNER_ADDED,
    details: { partnerName: data.name, partnershipId: membership.partnership_id },
  });

  revalidatePath("/settings/partner");
  revalidatePath("/settings/income");
  revalidatePath("/budget");
  revalidatePath("/plan");

  return { success: true };
}

/**
 * Remove manual partner data and soft-delete their income sources.
 */
export async function removeManualPartner() {
  const blocked = demoActionGuard(); if (blocked) return blocked;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: "No partnership found" };
  }

  // Clear manual partner fields
  const { error: partnerError } = await supabase
    .from("partnerships")
    .update({
      manual_partner_name: null,
      manual_partner_dob: null,
      manual_partner_target_retirement_age: null,
      manual_partner_super_balance_cents: 0,
      manual_partner_super_contribution_rate: 11.5,
    })
    .eq("id", membership.partnership_id);

  if (partnerError) {
    return { success: false, error: safeErrorMessage(partnerError, "Failed to remove manual partner") };
  }

  auditLog({
    userId: user.id,
    action: AuditAction.PARTNER_REMOVED,
    details: { partnershipId: membership.partnership_id },
  });

  // Soft-delete all manual partner income sources
  await supabase
    .from("income_sources")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("partnership_id", membership.partnership_id)
    .eq("is_manual_partner_income", true);

  revalidatePath("/settings/partner");
  revalidatePath("/settings/income");
  revalidatePath("/budget");
  revalidatePath("/plan");

  return { success: true };
}

/**
 * Get manual partner info from the user's partnership.
 * Returns null if no manual partner is configured.
 */
export async function getManualPartnerInfo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated", data: null };

  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { success: true, data: null };
  }

  const { data: partnership, error } = await supabase
    .from("partnerships")
    .select("manual_partner_name, manual_partner_dob, manual_partner_target_retirement_age, manual_partner_super_balance_cents, manual_partner_super_contribution_rate")
    .eq("id", membership.partnership_id)
    .maybeSingle();

  if (error || !partnership?.manual_partner_name) {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: {
      name: partnership.manual_partner_name,
      date_of_birth: partnership.manual_partner_dob,
      target_retirement_age: partnership.manual_partner_target_retirement_age,
      super_balance_cents: partnership.manual_partner_super_balance_cents || 0,
      super_contribution_rate: partnership.manual_partner_super_contribution_rate || 11.5,
    } as ManualPartnerData,
  };
}
