"use server";

import { createClient } from "@/utils/supabase/server";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { revalidatePath } from "next/cache";

function getCurrentFinancialYear(): number {
  const now = new Date();
  // Australian FY: July 1 to June 30
  // FY2026 = Jul 2025 - Jun 2026
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

export async function startOrResumeCheckup(financialYear?: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  const fy = financialYear || getCurrentFinancialYear();

  // Try to find existing checkup
  const { data: existing } = await supabase
    .from("annual_checkups")
    .select("*")
    .eq("partnership_id", partnershipId)
    .eq("financial_year", fy)
    .maybeSingle();

  if (existing) return existing;

  // Create new
  const { data, error } = await supabase
    .from("annual_checkups")
    .insert({
      partnership_id: partnershipId,
      financial_year: fy,
      current_step: 1,
      step_data: {},
      action_items: [],
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/plan");
  return data;
}

export async function saveCheckupStep(
  financialYear: number,
  step: number,
  stepData: Record<string, unknown>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const partnershipId = await getUserPartnershipId(supabase, user.id);

  // Fetch existing
  const { data: checkup, error: fetchError } = await supabase
    .from("annual_checkups")
    .select("step_data")
    .eq("partnership_id", partnershipId)
    .eq("financial_year", financialYear)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const existingStepData = (checkup.step_data as Record<string, unknown>) || {};
  const updatedStepData = {
    ...existingStepData,
    [String(step)]: {
      ...stepData,
      completed_at: new Date().toISOString(),
    },
  };

  const { error } = await supabase
    .from("annual_checkups")
    .update({
      step_data: updatedStepData,
      current_step: Math.max(step + 1, (checkup as any).current_step || 1),
    })
    .eq("partnership_id", partnershipId)
    .eq("financial_year", financialYear);

  if (error) throw new Error(error.message);
  revalidatePath("/plan");
}

export async function completeCheckup(
  financialYear: number,
  actionItems: { text: string; priority: string; done: boolean }[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const partnershipId = await getUserPartnershipId(supabase, user.id);

  const { error } = await supabase
    .from("annual_checkups")
    .update({
      action_items: actionItems,
      completed_at: new Date().toISOString(),
      current_step: 7,
    })
    .eq("partnership_id", partnershipId)
    .eq("financial_year", financialYear);

  if (error) throw new Error(error.message);
  revalidatePath("/plan");
}

export async function resetCheckup(financialYear: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) throw new Error("Could not find partnership");

  const { error } = await supabase
    .from("annual_checkups")
    .delete()
    .eq("partnership_id", partnershipId)
    .eq("financial_year", financialYear);

  if (error) throw new Error(error.message);
  revalidatePath("/plan");
}
