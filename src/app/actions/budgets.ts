"use server";

/**
 * Server actions for user_budgets table
 * Handles CRUD operations for multi-budget architecture
 */

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import {
  ALL_PARENT_CATEGORIES,
  getSubcategoriesForParents,
} from "@/lib/budget-templates";
import { generateUniqueSlug } from "@/lib/slugify";
import { createDefaultLayoutConfig } from "@/lib/layout-persistence";
import type { Section, LayoutConfig } from "@/lib/layout-persistence";

export interface UserBudget {
  id: string;
  partnership_id: string;
  name: string;
  slug: string;
  emoji: string;
  budget_type: "personal" | "household" | "custom";
  methodology: string;
  budget_view: "individual" | "shared";
  period_type: "weekly" | "fortnightly" | "monthly";
  is_active: boolean;
  is_default: boolean;
  color: string | null;
  template_source: string | null;
  category_filter: { included?: string[]; excluded?: string[] } | null;
  carryover_mode: "none";
  total_budget: number | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetInput {
  partnership_id: string;
  name: string;
  emoji?: string;
  budget_type: "personal" | "household" | "custom";
  methodology: string;
  budget_view?: "individual" | "shared";
  period_type?: "weekly" | "fortnightly" | "monthly";
  template_source?: string;
  category_filter?: { included?: string[]; excluded?: string[] } | null;
  color?: string;
  initial_sections?: Section[];
  hidden_item_ids?: string[];
  carryover_mode?: "none";
  total_budget?: number;
  start_date?: string;
  end_date?: string;
}

// =====================================================
// READ
// =====================================================

export async function getBudgets(partnershipId: string) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("user_budgets")
      .select("*")
      .eq("partnership_id", partnershipId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { data: (data ?? []) as UserBudget[], error: null };
  } catch (err) {
    console.error("Failed to fetch budgets:", err);
    return { data: [], error: "Failed to fetch budgets" };
  }
}

// =====================================================
// CREATE
// =====================================================

export async function createBudget(input: CreateBudgetInput) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Check if this is the first budget (make it default)
    const { count } = await supabase
      .from("user_budgets")
      .select("*", { count: "exact", head: true })
      .eq("partnership_id", input.partnership_id)
      .eq("is_active", true);

    const isFirst = (count ?? 0) === 0;

    const slug = await generateUniqueSlug(supabase, input.partnership_id, input.name);

    const { data, error } = await supabase
      .from("user_budgets")
      .insert({
        partnership_id: input.partnership_id,
        name: input.name,
        slug,
        emoji: input.emoji ?? "💰",
        budget_type: input.budget_type,
        methodology: input.methodology,
        budget_view: input.budget_view ?? "shared",
        period_type: input.period_type ?? "monthly",
        template_source: input.template_source ?? null,
        category_filter: input.category_filter ?? null,
        color: input.color ?? null,
        is_default: isFirst,
        created_by: user.id,
        carryover_mode: "none",
        total_budget: input.total_budget ?? null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    const budget = data as UserBudget;

    try {
      // Seed budget with subcategory assignments + goals + investments
      await seedBudgetAssignments(supabase, budget, user.id);

      // Save initial layout if sections were configured in wizard
      if (input.initial_sections && input.initial_sections.length > 0) {
        const defaults = createDefaultLayoutConfig();
        const layoutConfig: LayoutConfig = {
          sections: input.initial_sections,
          columns: defaults.columns,
          density: "comfortable",
          groupBy: "sections",
          hiddenItemIds: input.hidden_item_ids ?? [],
        };

        const { error: layoutError } = await supabase
          .from("budget_layout_presets")
          .insert({
            user_id: user.id,
            partnership_id: input.partnership_id,
            name: "Default",
            is_active: true,
            is_template: false,
            layout_config: layoutConfig,
            budget_id: budget.id,
            budget_view: budget.budget_view,
          });

        if (layoutError) {
          console.error("Failed to save layout preset:", layoutError);
          throw new Error(`Failed to save layout: ${layoutError.message}`);
        }
      }
    } catch (seedError) {
      // Rollback: Delete budget if seeding or layout creation fails
      console.error("Seeding failed, rolling back budget creation:", seedError);
      await supabase.from("user_budgets").delete().eq("id", budget.id);
      throw seedError; // Re-throw to propagate to outer catch
    }

    revalidatePath("/budget");
    return { data: budget, error: null };
  } catch (err) {
    console.error("Failed to create budget:", err);
    return { data: null, error: "Failed to create budget" };
  }
}

/**
 * Seeds a new budget with $0 assignment rows for every subcategory
 * within the included parent categories, plus rows for the user's
 * active savings goals and investments.
 */
async function seedBudgetAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  budget: UserBudget,
  userId: string
) {
  const currentMonth = new Date();
  currentMonth.setDate(1);
  const monthStr = currentMonth.toISOString().split("T")[0];

  // Determine which parent categories are included
  const parentCategories: string[] =
    budget.category_filter?.included && budget.category_filter.included.length > 0
      ? budget.category_filter.included
      : [...ALL_PARENT_CATEGORIES];

  // Get all subcategories for included parents
  const subcategories = getSubcategoriesForParents(parentCategories);

  // Build category assignment rows
  const categoryRows = subcategories.map((sub) => ({
    partnership_id: budget.partnership_id,
    month: monthStr,
    assignment_type: "category",
    category_name: sub.parent,
    subcategory_name: sub.child,
    assigned_cents: 0,
    budget_view: budget.budget_view,
    stored_period_type: budget.period_type,
    budget_id: budget.id,
    created_by: userId,
  }));

  // Fetch active savings goals for the partnership
  const { data: goals } = await supabase
    .from("savings_goals")
    .select("id")
    .eq("partnership_id", budget.partnership_id)
    .eq("is_completed", false);

  const goalRows = (goals ?? []).map((g: { id: string }) => ({
    partnership_id: budget.partnership_id,
    month: monthStr,
    assignment_type: "goal",
    category_name: "",
    goal_id: g.id,
    assigned_cents: 0,
    budget_view: budget.budget_view,
    stored_period_type: budget.period_type,
    budget_id: budget.id,
    created_by: userId,
  }));

  // Fetch active investments for the partnership
  const { data: investments } = await supabase
    .from("investments")
    .select("id")
    .eq("partnership_id", budget.partnership_id);

  const investmentRows = (investments ?? []).map((i: { id: string }) => ({
    partnership_id: budget.partnership_id,
    month: monthStr,
    assignment_type: "asset",
    category_name: "",
    asset_id: i.id,
    assigned_cents: 0,
    budget_view: budget.budget_view,
    stored_period_type: budget.period_type,
    budget_id: budget.id,
    created_by: userId,
  }));

  const allRows = [...categoryRows, ...goalRows, ...investmentRows];

  if (allRows.length > 0) {
    const { error: seedError } = await supabase
      .from("budget_assignments")
      .insert(allRows);

    if (seedError) {
      console.error("Failed to seed budget assignments:", seedError);
      throw new Error(`Failed to seed budget assignments: ${seedError.message}`);
    }
  }
}

// =====================================================
// UPDATE
// =====================================================

export async function updateBudget(
  budgetId: string,
  updates: Partial<
    Pick<
      UserBudget,
      | "name"
      | "emoji"
      | "methodology"
      | "budget_view"
      | "period_type"
      | "category_filter"
      | "color"
    >
  >
) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();

    // Regenerate slug when name changes
    let finalUpdates: Record<string, unknown> = { ...updates };
    if (updates.name) {
      const { data: currentBudget } = await supabase
        .from("user_budgets")
        .select("partnership_id")
        .eq("id", budgetId)
        .single();

      if (currentBudget) {
        const slug = await generateUniqueSlug(
          supabase,
          currentBudget.partnership_id,
          updates.name,
          budgetId
        );
        finalUpdates = { ...finalUpdates, slug };
      }
    }

    const { data, error } = await supabase
      .from("user_budgets")
      .update(finalUpdates)
      .eq("id", budgetId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath("/budget");
    return { data: data as UserBudget, error: null };
  } catch (err) {
    console.error("Failed to update budget:", err);
    return { data: null, error: "Failed to update budget" };
  }
}

// =====================================================
// DELETE
// =====================================================

export async function deleteBudget(budgetId: string) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();

    // Soft delete — mark inactive
    const { error } = await supabase
      .from("user_budgets")
      .update({ is_active: false, is_default: false })
      .eq("id", budgetId);

    if (error) throw error;

    revalidatePath("/budget");
    return { error: null };
  } catch (err) {
    console.error("Failed to delete budget:", err);
    return { error: "Failed to delete budget" };
  }
}

// =====================================================
// SET DEFAULT
// =====================================================

export async function setDefaultBudget(
  budgetId: string,
  partnershipId: string
) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();

    // Clear existing defaults
    await supabase
      .from("user_budgets")
      .update({ is_default: false })
      .eq("partnership_id", partnershipId)
      .eq("is_default", true);

    // Set new default
    const { error } = await supabase
      .from("user_budgets")
      .update({ is_default: true })
      .eq("id", budgetId);

    if (error) throw error;

    revalidatePath("/budget");
    return { error: null };
  } catch (err) {
    console.error("Failed to set default budget:", err);
    return { error: "Failed to set default budget" };
  }
}

// =====================================================
// DUPLICATE
// =====================================================

export async function duplicateBudget(budgetId: string, newName: string) {
  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Fetch original budget
    const { data: original, error: fetchError } = await supabase
      .from("user_budgets")
      .select("*")
      .eq("id", budgetId)
      .single();

    if (fetchError || !original) throw fetchError ?? new Error("Not found");

    // Create duplicate
    const slug = await generateUniqueSlug(supabase, original.partnership_id, newName);

    const { data: newBudget, error: createError } = await supabase
      .from("user_budgets")
      .insert({
        partnership_id: original.partnership_id,
        name: newName,
        slug,
        emoji: original.emoji,
        budget_type: original.budget_type,
        methodology: original.methodology,
        budget_view: original.budget_view,
        period_type: original.period_type,
        template_source: original.template_source,
        category_filter: original.category_filter,
        color: original.color,
        carryover_mode: "none",
        is_default: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError || !newBudget) throw createError;

    // Copy budget assignments from current month
    const currentMonth = new Date();
    currentMonth.setDate(1);
    const monthStr = currentMonth.toISOString().split("T")[0];

    const { data: assignments } = await supabase
      .from("budget_assignments")
      .select("*")
      .eq("budget_id", budgetId)
      .eq("month", monthStr);

    if (assignments && assignments.length > 0) {
      const newAssignments = assignments.map((a: Record<string, unknown>) => ({
        partnership_id: a.partnership_id,
        month: a.month,
        category_name: a.category_name,
        subcategory_name: a.subcategory_name,
        assigned_cents: a.assigned_cents,
        assignment_type: a.assignment_type,
        goal_id: a.goal_id,
        asset_id: a.asset_id,
        budget_view: a.budget_view,
        stored_period_type: a.stored_period_type,
        budget_id: newBudget.id,
        created_by: user.id,
      }));

      await supabase.from("budget_assignments").insert(newAssignments);
    }

    revalidatePath("/budget");
    return { data: newBudget as UserBudget, error: null };
  } catch (err) {
    console.error("Failed to duplicate budget:", err);
    return { data: null, error: "Failed to duplicate budget" };
  }
}
