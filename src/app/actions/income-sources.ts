"use server";

/**
 * Server actions for income_sources table
 * Handles CRUD operations for multiple income sources
 */

import { createClient } from "@/utils/supabase/server";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { z } from "zod";

const VALID_FREQUENCIES = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'] as const;
const frequencySchema = z.enum(VALID_FREQUENCIES);

export interface IncomeSource {
  id?: string;
  user_id: string;
  partnership_id?: string;
  name: string;
  source_type: 'recurring-salary' | 'one-off';
  one_off_type?: 'bonus' | 'gift' | 'dividend' | 'tax-refund' | 'freelance' | 'other';
  amount_cents: number;
  frequency?: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';
  last_pay_date?: string;
  next_pay_date?: string;
  expected_date?: string;
  received_date?: string;
  is_received?: boolean;
  linked_transaction_id?: string;
  match_pattern?: string;
  notes?: string;
  is_active?: boolean;
  is_manual_partner_income?: boolean;
}

// =====================================================
// CREATE
// =====================================================

export async function createIncomeSource(data: IncomeSource) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const userPartnershipId = await getUserPartnershipId(supabase, user.id);
    if (!userPartnershipId) {
      return { data: null, error: "Not authorized" };
    }

    // Validate amount_cents
    if (data.amount_cents !== undefined && (!Number.isFinite(data.amount_cents) || data.amount_cents < 0)) {
      return { success: false, error: "Invalid amount" };
    }

    // Validate frequency if provided
    if (data.frequency !== undefined && !frequencySchema.safeParse(data.frequency).success) {
      return { success: false, error: "Invalid frequency. Must be one of: weekly, fortnightly, monthly, quarterly, yearly" };
    }

    const { data: incomeSource, error } = await supabase
      .from("income_sources")
      .insert({
        user_id: user.id,
        partnership_id: userPartnershipId,
        name: data.name,
        source_type: data.source_type,
        one_off_type: data.one_off_type,
        amount_cents: data.amount_cents,
        frequency: data.frequency,
        last_pay_date: data.last_pay_date,
        next_pay_date: data.next_pay_date,
        expected_date: data.expected_date,
        received_date: data.received_date,
        is_received: data.is_received || false,
        linked_transaction_id: data.linked_transaction_id,
        match_pattern: data.match_pattern,
        notes: data.notes,
        is_active: data.is_active !== undefined ? data.is_active : true,
        is_manual_partner_income: data.is_manual_partner_income || false,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: safeErrorMessage(error, "Failed to create income source") };
    }

    return { success: true, data: incomeSource };
  } catch (error) {
    return { success: false, error: safeErrorMessage(error, "Failed to create income source") };
  }
}

// =====================================================
// READ
// =====================================================

export async function getIncomeSources(userId?: string) {
  // No demo guard — reads should work in demo mode
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated", data: [] };

    const { data: incomeSources, error } = await supabase
      .from("income_sources")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("is_manual_partner_income", false)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: safeErrorMessage(error, "Failed to fetch income sources"), data: [] };
    }

    return { success: true, data: incomeSources || [] };
  } catch (error) {
    return { success: false, error: safeErrorMessage(error, "Failed to fetch income sources"), data: [] };
  }
}

export async function getManualPartnerIncomeSources(partnershipId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated", data: [] };

    const userPartnershipId = await getUserPartnershipId(supabase, user.id);
    if (!userPartnershipId || userPartnershipId !== partnershipId) {
      return { data: [], error: "Not authorized" };
    }

    // Defense-in-depth: verify direct membership
    const { data: membership } = await supabase
      .from("partnership_members")
      .select("id")
      .eq("partnership_id", partnershipId)
      .eq("user_id", user.id)
      .single();
    if (!membership) return { data: [], error: "Not authorized" };

    const { data: incomeSources, error } = await supabase
      .from("income_sources")
      .select("*")
      .eq("partnership_id", partnershipId)
      .eq("is_manual_partner_income", true)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: safeErrorMessage(error, "Failed to fetch manual partner income sources"), data: [] };
    }

    return { success: true, data: incomeSources || [] };
  } catch (error) {
    return { success: false, error: safeErrorMessage(error, "Failed to fetch manual partner income sources"), data: [] };
  }
}

// =====================================================
// UPDATE
// =====================================================

export async function updateIncomeSource(id: string, data: Partial<IncomeSource>) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // Validate amount_cents
    if (data.amount_cents !== undefined && (!Number.isFinite(data.amount_cents) || data.amount_cents < 0)) {
      return { success: false, error: "Invalid amount" };
    }

    // Validate frequency if provided
    if (data.frequency !== undefined && !frequencySchema.safeParse(data.frequency).success) {
      return { success: false, error: "Invalid frequency. Must be one of: weekly, fortnightly, monthly, quarterly, yearly" };
    }

    const { data: incomeSource, error } = await supabase
      .from("income_sources")
      .update({
        name: data.name,
        amount_cents: data.amount_cents,
        frequency: data.frequency,
        last_pay_date: data.last_pay_date,
        next_pay_date: data.next_pay_date,
        expected_date: data.expected_date,
        received_date: data.received_date,
        is_received: data.is_received,
        notes: data.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: safeErrorMessage(error, "Failed to update income source") };
    }

    return { success: true, data: incomeSource };
  } catch (error) {
    return { success: false, error: safeErrorMessage(error, "Failed to update income source") };
  }
}

// =====================================================
// DELETE
// =====================================================

export async function deleteIncomeSource(id: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // Soft delete - set is_active to false, scoped to user's own records
    const { error } = await supabase
      .from("income_sources")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: safeErrorMessage(error, "Failed to delete income source") };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: safeErrorMessage(error, "Failed to delete income source") };
  }
}

// =====================================================
// MARK ONE-OFF AS RECEIVED
// =====================================================

export async function markOneOffReceived(id: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data, error } = await supabase
      .from("income_sources")
      .update({
        is_received: true,
        received_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("source_type", "one-off")
      .select()
      .single();

    if (error) {
      return { success: false, error: safeErrorMessage(error, "Failed to mark income as received") };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: safeErrorMessage(error, "Failed to mark income as received") };
  }
}

