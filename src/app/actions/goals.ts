"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { createNotification, isNotificationEnabled } from "@/lib/create-notification";

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

export async function addFundsToGoal(goalId: string, amountCents: number) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Fetch current goal
  const { data: goal, error: fetchError } = await supabase
    .from("savings_goals")
    .select("current_amount_cents, target_amount_cents, name")
    .eq("id", goalId)
    .maybeSingle();

  if (fetchError || !goal) {
    return { error: "Goal not found" };
  }

  // Update goal
  const newAmount = goal.current_amount_cents + amountCents;
  const isCompleted = newAmount >= goal.target_amount_cents;

  const { error: updateError } = await supabase
    .from("savings_goals")
    .update({
      current_amount_cents: newAmount,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId);

  if (updateError) {
    return { error: updateError.message };
  }

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
    goal.name,
    goal.current_amount_cents,
    newAmount,
    goal.target_amount_cents
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

  // Fetch goal info for notification
  const { data: goal } = await supabase
    .from("savings_goals")
    .select("name, current_amount_cents, target_amount_cents")
    .eq("id", goalId)
    .maybeSingle();

  const { error } = await supabase
    .from("savings_goals")
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId);

  if (error) {
    return { error: error.message };
  }

  // Create 100% milestone notification
  if (goal) {
    checkAndCreateMilestoneNotification(
      supabase,
      user.id,
      goalId,
      goal.name,
      goal.current_amount_cents,
      goal.target_amount_cents,
      goal.target_amount_cents
    );
  }

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

  const { error } = await supabase
    .from("savings_goals")
    .update({
      is_completed: false,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId);

  if (error) {
    return { error: error.message };
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

  const { error } = await supabase
    .from("savings_goals")
    .delete()
    .eq("id", goalId);

  if (error) {
    return { error: error.message };
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

  const { error } = await supabase
    .from("savings_goals")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId);

  if (error) {
    return { error: error.message };
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

  const { data: goal, error: fetchError } = await supabase
    .from("savings_goals")
    .select("preparation_checklist")
    .eq("id", goalId)
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
    .eq("id", goalId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/goals");
  revalidatePath("/plan");
  return { success: true };
}
