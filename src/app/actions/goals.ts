"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { createNotification, isNotificationEnabled } from "@/lib/create-notification";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  buildTaskInputSignature,
  evaluateTaskCache,
  generateFallbackGoalTasks,
  packGeneratedTasks,
} from "@/lib/goal-tasks";
import type { GoalContribution, GoalForCalculation } from "@/lib/goal-calculations";
import { trackFirst } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

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

  // Capture start_amount_cents — the value we'll subtract when computing
  // progress later. For a linked Saver, this is the account's balance at
  // creation; otherwise it matches the user-entered current amount.
  // Without this, linking an existing $5k Saver to a $10k goal would show
  // 50% progress before the user has saved a single dollar toward the goal.
  let startAmountCents = currentCents;
  if (data.linked_account_id) {
    const { data: linkedAcct } = await supabase
      .from("accounts")
      .select("balance_cents")
      .eq("id", data.linked_account_id)
      .maybeSingle();
    if (linkedAcct?.balance_cents !== undefined) {
      startAmountCents = linkedAcct.balance_cents;
    }
  }

  const { error } = await supabase
    .from("savings_goals")
    .insert({
      partnership_id: partnershipId,
      name: data.name,
      target_amount_cents: data.target_amount_cents,
      current_amount_cents: currentCents,
      start_amount_cents: startAmountCents,
      deadline: data.deadline || null,
      icon: data.icon || "piggy-bank",
      color: data.color || "oklch(0.75 0.12 25)",
      linked_account_id: data.linked_account_id || null,
    });

  if (error) {
    return { error: safeErrorMessage(error, "Failed to create goal") };
  }

  // Phase 4 instrumentation: first_goal_created. Deduped via funnel_events.
  void trackFirst(FunnelEvent.FIRST_GOAL_CREATED, {
    userId: user.id,
    tenantId: user.id,
    properties: { goal_name: data.name, target_cents: data.target_amount_cents },
  });

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

  // Phase 1 #52 — a contribution moves current_amount_cents which is in
  // the task input signature, so kick a background regeneration. We pass
  // through evaluateTaskCache; signature change forces fresh tasks even
  // inside the 24h TTL.
  void maybeRegenerateGoalTasksAfterChange(goalId);

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

  // Phase 1 #52 — if any signature-relevant field changed (target,
  // current, deadline, linked saver) regenerate tasks in the background.
  if (
    target_amount_cents !== undefined ||
    current_amount_cents !== undefined ||
    deadline !== undefined ||
    linked_account_id !== undefined
  ) {
    void maybeRegenerateGoalTasksAfterChange(goalId);
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

// ============================================================================
// Phase 1 #52 — Generated tasks regeneration
// ============================================================================

/**
 * Regenerates the AI-suggested next-step task list for a goal. Reads
 * CURRENT goal state (never a snapshot), respects the 24h cache, and
 * persists the result with an opaque input signature. Callable as both
 * a manual server action ("Refresh tasks" button) and an automated
 * trigger from addFundsToGoal / updateGoal.
 *
 * `force=true` bypasses the cache (used by the manual refresh button).
 */
export async function regenerateGoalTasks(
  goalId: string,
  options: { force?: boolean } = {}
) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "Could not find partnership" };

  // Read CURRENT goal state — the whole point of this work is to never
  // trust a snapshot from goal creation.
  const { data: goalRow, error: goalErr } = await supabase
    .from("savings_goals")
    .select(
      "id, name, icon, color, target_amount_cents, current_amount_cents, deadline, is_completed, created_at, linked_account_id, generated_tasks, tasks_generated_at, tasks_input_signature"
    )
    .eq("id", goalId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (goalErr || !goalRow) {
    return { error: "Goal not found" };
  }

  const liveSignature = buildTaskInputSignature({
    current_amount_cents: goalRow.current_amount_cents,
    target_amount_cents: goalRow.target_amount_cents,
    deadline: goalRow.deadline,
    is_completed: goalRow.is_completed,
    linked_account_id: goalRow.linked_account_id,
  });

  if (!options.force) {
    const cacheStatus = evaluateTaskCache(
      {
        tasks_generated_at: goalRow.tasks_generated_at,
        tasks_input_signature: goalRow.tasks_input_signature,
        generated_tasks: goalRow.generated_tasks,
      },
      liveSignature
    );
    if (cacheStatus.isFresh) {
      return { success: true, cached: true, reason: cacheStatus.reason };
    }
  }

  // Pull recent contributions so velocity reflects CURRENT pace.
  const { data: contribRows } = await supabase
    .from("goal_contributions")
    .select("id, goal_id, amount_cents, balance_after_cents, source, created_at")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false })
    .limit(60);

  const contributions: GoalContribution[] = (contribRows || []).map((c: Record<string, unknown>) => ({
    id: (c.id as string) || "",
    goal_id: c.goal_id as string,
    amount_cents: c.amount_cents as number,
    balance_after_cents: c.balance_after_cents as number,
    source: c.source as GoalContribution["source"],
    created_at: c.created_at as string,
  }));

  const goalForCalc: GoalForCalculation = {
    id: goalRow.id,
    name: goalRow.name,
    icon: goalRow.icon || "",
    color: goalRow.color || "",
    current_amount_cents: goalRow.current_amount_cents,
    target_amount_cents: goalRow.target_amount_cents,
    deadline: goalRow.deadline,
    is_completed: goalRow.is_completed,
    created_at: goalRow.created_at,
  };

  // For now we use the deterministic fallback generator. The brief
  // explicitly says "use the Penny tool or similar" — when the user has
  // an AI provider configured we could route through generateGoalTasks,
  // but doing that on every state change would burn credits. The
  // fallback is good enough as the persistent cached layer; the AI tool
  // is on-demand (chat) for richer suggestions.
  const tasks = generateFallbackGoalTasks(goalForCalc, contributions, {
    hasLinkedSaver: !!goalRow.linked_account_id,
  });
  const payload = packGeneratedTasks(tasks, liveSignature, "fallback");

  const { error: updateErr } = await supabase
    .from("savings_goals")
    .update({
      generated_tasks: payload,
      tasks_generated_at: payload.generatedAt,
      tasks_input_signature: liveSignature,
    })
    .eq("id", goalId)
    .eq("partnership_id", partnershipId);

  if (updateErr) {
    return { error: safeErrorMessage(updateErr, "Failed to save generated tasks") };
  }

  revalidatePath(`/goals/${goalId}`);
  revalidatePath("/goals");
  return { success: true, cached: false, taskCount: tasks.length };
}

/**
 * Internal helper — invoked by addFundsToGoal / updateGoal whenever the
 * input signature has plausibly changed. Fire-and-forget: we never want
 * task regeneration to block the user-visible write.
 */
async function maybeRegenerateGoalTasksAfterChange(goalId: string) {
  // Intentionally not awaited by callers — they `void`-discard.
  try {
    await regenerateGoalTasks(goalId, { force: false });
  } catch (err) {
    console.error("Background goal task regeneration failed:", err);
  }
}

/**
 * Setting toggle: weekday-only saving cadence (Phase 1 #52). When true,
 * "X days to go" math skips Saturdays and Sundays.
 */
export async function setGoalWeekdayOnlyCadence(
  goalId: string,
  weekdayOnly: boolean
) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) return { error: "Could not find partnership" };

  const { error } = await supabase
    .from("savings_goals")
    .update({ weekday_only_cadence: weekdayOnly, updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("partnership_id", partnershipId);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to update cadence preference") };
  }

  revalidatePath(`/goals/${goalId}`);
  return { success: true };
}
