"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { createNotification, isNotificationEnabled } from "@/lib/create-notification";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { safeErrorMessage } from "@/lib/safe-error";

const MILESTONE_THRESHOLDS = [25, 50, 75, 100];

async function checkAndCreateMilestoneNotification(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  goalId: string,
  goalName: string,
  oldAmountCents: number,
  newAmountCents: number,
  targetAmountCents: number
) {
  try {
    const enabled = await isNotificationEnabled(supabase, userId, "goal_milestone");
    if (!enabled) return;

    const oldPercent = (oldAmountCents / targetAmountCents) * 100;
    const newPercent = (newAmountCents / targetAmountCents) * 100;

    for (const threshold of MILESTONE_THRESHOLDS) {
      if (oldPercent < threshold && newPercent >= threshold) {
        const title =
          threshold === 100
            ? `${goalName} complete!`
            : `${goalName} hit ${threshold}%`;
        const message =
          threshold === 100
            ? `Congratulations! You've reached your savings goal of $${(targetAmountCents / 100).toFixed(2)} for ${goalName}.`
            : `You're ${threshold}% of the way to your ${goalName} goal — $${(newAmountCents / 100).toFixed(2)} of $${(targetAmountCents / 100).toFixed(2)}.`;

        await createNotification(supabase, {
          userId,
          type: "goal_milestone",
          title,
          message,
          metadata: {
            goal_id: goalId,
            goal_name: goalName,
            milestone_percent: threshold,
            current_amount_cents: newAmountCents,
            target_amount_cents: targetAmountCents,
          },
        });
        break; // Only create one notification per update (highest milestone crossed)
      }
    }
  } catch (err) {
    // Don't let notification failure break the goal update
    console.error("Failed to create milestone notification:", err);
  }
}

export async function createGoal(data: {
  name: string;
  target_amount_cents: number;
  current_amount_cents?: number;
  deadline?: string | null;
  icon?: string;
  color?: string;
  linked_account_id?: string | null;
}) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) {
    return { error: "Please set up your budget first" };
  }

  // Validate amounts
  if (!Number.isFinite(data.target_amount_cents) || data.target_amount_cents <= 0) {
    return { error: "Please enter a valid target amount greater than zero" };
  }

  const currentCents = data.current_amount_cents ?? 0;
  if (!Number.isFinite(currentCents) || currentCents < 0) {
    return { error: "Please enter a valid current amount" };
  }

  // Verify linked_account_id belongs to a member of this partnership
  if (data.linked_account_id) {
    const { data: accountOwner } = await supabase
      .from("accounts")
      .select("user_id")
      .eq("id", data.linked_account_id)
      .maybeSingle();

    if (!accountOwner) {
      return { error: "Linked account not found" };
    }

    const { data: ownerMembership } = await supabase
      .from("partnership_members")
      .select("partnership_id")
      .eq("user_id", accountOwner.user_id)
      .eq("partnership_id", partnershipId)
      .maybeSingle();

    if (!ownerMembership) {
      return { error: "Linked account does not belong to your partnership" };
    }
  }

  const { error } = await supabase
    .from("savings_goals")
    .insert({
      partnership_id: partnershipId,
      name: data.name,
      target_amount_cents: data.target_amount_cents,
      current_amount_cents: currentCents,
      deadline: data.deadline || null,
      icon: data.icon || "piggy-bank",
      color: data.color || "oklch(0.75 0.12 25)",
      linked_account_id: data.linked_account_id || null,
    });

  if (error) {
    return { error: safeErrorMessage(error, "Failed to create goal") };
  }

  revalidatePath("/goals");
  revalidatePath("/home");
  revalidatePath("/plan");
  return { success: true };
}

export async function addFundsToGoal(goalId: string, amountCents: number) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return { error: "Invalid amount" };
  }

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) {
    return { error: "Could not find partnership" };
  }

  // Fetch old amount for milestone notification comparison
  const { data: goalBefore, error: fetchError } = await supabase
    .from("savings_goals")
    .select("current_amount_cents, target_amount_cents, name")
    .eq("id", goalId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (fetchError || !goalBefore) {
    return { error: "Goal not found" };
  }

  const oldAmountCents = goalBefore.current_amount_cents;

  // Atomic increment — prevents read-modify-write race condition (M81)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "add_funds_to_goal",
    {
      p_goal_id: goalId,
      p_partnership_id: partnershipId,
      p_amount_cents: amountCents,
    }
  );

  if (rpcError) {
    return { error: safeErrorMessage(rpcError, "Failed to add funds to goal") };
  }

  const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!row) {
    return { error: "Goal not found" };
  }

  const newAmount = Number(row.new_amount_cents);

  // Record contribution history (fire and forget)
  supabase
    .from("goal_contributions")
    .insert({
      goal_id: goalId,
      amount_cents: amountCents,
      balance_after_cents: newAmount,
      source: "manual" as const,
    })
    .then(({ error: contribError }) => {
      if (contribError) console.error("Failed to record goal contribution:", contribError);
    });

  // Check for milestone notifications (don't await — fire and forget)
  checkAndCreateMilestoneNotification(
    supabase,
    user.id,
    goalId,
    goalBefore.name,
    oldAmountCents,
    newAmount,
    goalBefore.target_amount_cents
  );

  revalidatePath("/goals");
  revalidatePath("/home");
  revalidatePath("/plan");
  return { success: true };
}

export async function markGoalComplete(goalId: string) {
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

  // Fetch goal info for notification with partnership ownership check
  const { data: goal } = await supabase
    .from("savings_goals")
    .select("name, current_amount_cents, target_amount_cents")
    .eq("id", goalId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!goal) {
    return { error: "Goal not found" };
  }

  const { error } = await supabase
    .from("savings_goals")
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to mark goal as complete") };
  }

  // Create 100% milestone notification
  checkAndCreateMilestoneNotification(
    supabase,
    user.id,
    goalId,
    goal.name,
    goal.current_amount_cents,
    goal.target_amount_cents,
    goal.target_amount_cents
  );

  revalidatePath("/goals");
  revalidatePath("/home");
  revalidatePath("/plan");
  return { success: true };
}

export async function reopenGoal(goalId: string) {
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

  const { error } = await supabase
    .from("savings_goals")
    .update({
      is_completed: false,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to reopen goal") };
  }

  revalidatePath("/goals");
  revalidatePath("/home");
  revalidatePath("/plan");
  return { success: true };
}

export async function deleteGoal(goalId: string) {
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

  const { error } = await supabase
    .from("savings_goals")
    .delete()
    .eq("id", goalId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to delete goal") };
  }

  revalidatePath("/goals");
  revalidatePath("/home");
  revalidatePath("/plan");
  return { success: true };
}

export async function updateGoal(
  goalId: string,
  data: {
    name?: string;
    target_amount_cents?: number;
    current_amount_cents?: number;
    deadline?: string | null;
    icon?: string;
    color?: string;
    linked_account_id?: string | null;
    description?: string | null;
    preparation_checklist?: { item: string; done: boolean }[];
    estimated_monthly_impact_cents?: number;
    sort_order?: number;
  }
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

  // Whitelist allowed fields to prevent mass assignment
  const { name, target_amount_cents, current_amount_cents, deadline, icon, color,
          linked_account_id, description, preparation_checklist,
          estimated_monthly_impact_cents, sort_order } = data;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (target_amount_cents !== undefined) updates.target_amount_cents = target_amount_cents;
  if (current_amount_cents !== undefined) updates.current_amount_cents = current_amount_cents;
  if (deadline !== undefined) updates.deadline = deadline;
  if (icon !== undefined) updates.icon = icon;
  if (color !== undefined) updates.color = color;
  if (linked_account_id !== undefined) {
    // Verify linked_account_id belongs to a member of this partnership
    if (linked_account_id !== null) {
      const { data: accountOwner } = await supabase
        .from("accounts")
        .select("user_id")
        .eq("id", linked_account_id)
        .maybeSingle();

      if (!accountOwner) {
        return { error: "Linked account not found" };
      }

      const { data: ownerMembership } = await supabase
        .from("partnership_members")
        .select("partnership_id")
        .eq("user_id", accountOwner.user_id)
        .eq("partnership_id", partnershipId)
        .maybeSingle();

      if (!ownerMembership) {
        return { error: "Linked account does not belong to your partnership" };
      }
    }
    updates.linked_account_id = linked_account_id;
  }
  if (description !== undefined) updates.description = description;
  if (preparation_checklist !== undefined) updates.preparation_checklist = preparation_checklist;
  if (estimated_monthly_impact_cents !== undefined) updates.estimated_monthly_impact_cents = estimated_monthly_impact_cents;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("savings_goals")
    .update(updates)
    .eq("id", goalId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to update goal") };
  }

  revalidatePath("/goals");
  revalidatePath("/home");
  revalidatePath("/plan");
  return { success: true };
}

export async function toggleGoalChecklistItem(
  goalId: string,
  itemIndex: number
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

  const { data: goal, error: fetchError } = await supabase
    .from("savings_goals")
    .select("preparation_checklist")
    .eq("id", goalId)
    .eq("partnership_id", partnershipId)
    .single();

  if (fetchError || !goal) {
    return { error: "Goal not found" };
  }

  const checklist = (goal.preparation_checklist as { item: string; done: boolean }[]) || [];
  if (itemIndex >= 0 && itemIndex < checklist.length) {
    checklist[itemIndex] = { ...checklist[itemIndex], done: !checklist[itemIndex].done };
  }

  const { error } = await supabase
    .from("savings_goals")
    .update({ preparation_checklist: checklist })
    .eq("id", goalId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to toggle checklist item") };
  }

  revalidatePath("/goals");
  revalidatePath("/plan");
  return { success: true };
}
