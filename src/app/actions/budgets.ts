"use server";

/**
 * Server actions for user_budgets table
 * Handles CRUD operations for multi-budget architecture
 */

import { z } from "zod/v4";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import {
  ALL_PARENT_CATEGORIES,
  getSubcategoriesForParents,
} from "@/lib/budget-templates";
import { slugify, generateUniqueSlug, insertBudgetWithSlugRetry } from "@/lib/slugify";
import { createDefaultLayoutConfig } from "@/lib/layout-persistence";
import type { Section, LayoutConfig } from "@/lib/layout-persistence";
import { getUserPartnershipId } from "@/lib/get-user-partnership";

// =====================================================
// ZOD SCHEMAS
// =====================================================

const budgetTypeSchema = z.enum(["personal", "household", "custom"]);
const budgetViewSchema = z.enum(["individual", "shared"]);
const periodTypeSchema = z.enum(["weekly", "fortnightly", "monthly"]);

const categoryFilterSchema = z
  .object({
    included: z.array(z.string().max(100)).optional(),
    excluded: z.array(z.string().max(100)).optional(),
  })
  .nullable()
  .optional();

const sectionSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(200),
  itemIds: z.array(z.string().max(200)),
});

const createBudgetSchema = z.object({
  partnership_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  emoji: z.string().max(10).optional(),
  budget_type: budgetTypeSchema,
  methodology: z.string().min(1).max(50),
  budget_view: budgetViewSchema.optional(),
  period_type: periodTypeSchema.optional(),
  template_source: z.string().max(100).optional(),
  category_filter: categoryFilterSchema,
  color: z.string().max(20).optional(),
  initial_sections: z.array(sectionSchema).max(50).optional(),
  hidden_item_ids: z.array(z.string().max(200)).max(500).optional(),
  carryover_mode: z.literal("none").optional(),
  total_budget: z.number().int().min(0).max(100_000_000_00).optional(), // max $100M in cents
  start_date: z.string().max(30).optional(),
  end_date: z.string().max(30).optional(),
});

const updateBudgetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().max(10).optional(),
  methodology: z.string().min(1).max(50).optional(),
  budget_view: budgetViewSchema.optional(),
  period_type: periodTypeSchema.optional(),
  category_filter: categoryFilterSchema,
  color: z.string().max(20).optional(),
});

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
  /** Total budget cap in cents (e.g. 500000 = $5,000) */
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
  /** Total budget cap in cents (e.g. 500000 = $5,000). Stored directly in DB. */
  total_budget?: number;
  start_date?: string;
  end_date?: string;
}

// =====================================================
// READ
// =====================================================

export async function getBudgets(partnershipId: string) {
  const parsed = z.string().uuid().safeParse(partnershipId);
  if (!parsed.success) return { data: [], error: "Invalid partnership ID" };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated" };

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
  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: "Invalid input: " + parsed.error.issues.map(i => i.message).join(", ") };
  input = parsed.data as CreateBudgetInput;

  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const userPartnershipId = await getUserPartnershipId(supabase, user.id);
    if (!userPartnershipId || userPartnershipId !== input.partnership_id) {
      throw new Error("Not authorized for this partnership");
    }

    // Check if this is the first budget (make it default)
    const { count } = await supabase
      .from("user_budgets")
      .select("*", { count: "exact", head: true })
      .eq("partnership_id", input.partnership_id)
      .eq("is_active", true);

    const isFirst = (count ?? 0) === 0;

    const budgetRow = {
      partnership_id: input.partnership_id,
      name: input.name,
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
    };

    const { data, error } = await insertBudgetWithSlugRetry(
      supabase,
      budgetRow,
      input.partnership_id,
      input.name
    );

    if (error) throw error;

    const budget = data as unknown as UserBudget;

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
          console.error("Layout save Supabase error:", layoutError);
          throw new Error("Failed to save layout");
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
      console.error("Seed budget assignments Supabase error:", seedError);
      throw new Error("Failed to seed budget assignments");
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
  const idParsed = z.string().uuid().safeParse(budgetId);
  if (!idParsed.success) return { data: null, error: "Invalid budget ID" };
  const updatesParsed = updateBudgetSchema.safeParse(updates);
  if (!updatesParsed.success) return { data: null, error: "Invalid input: " + updatesParsed.error.issues.map(i => i.message).join(", ") };
  updates = updatesParsed.data;

  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated" };

    // Verify the budget belongs to the user's partnership
    const partnershipId = await getUserPartnershipId(supabase, user.id);
    if (!partnershipId) return { data: null, error: "No partnership found" };

    const { data: currentBudget } = await supabase
      .from("user_budgets")
      .select("partnership_id")
      .eq("id", budgetId)
      .single();

    if (!currentBudget || currentBudget.partnership_id !== partnershipId) {
      return { data: null, error: "Budget not found" };
    }

    // Destructure only expected fields — no spread
    const { name, emoji, methodology, budget_view, period_type, category_filter, color } = updates;
    const finalUpdates: Record<string, unknown> = {};
    if (name !== undefined) finalUpdates.name = name;
    if (emoji !== undefined) finalUpdates.emoji = emoji;
    if (methodology !== undefined) finalUpdates.methodology = methodology;
    if (budget_view !== undefined) finalUpdates.budget_view = budget_view;
    if (period_type !== undefined) finalUpdates.period_type = period_type;
    if (category_filter !== undefined) finalUpdates.category_filter = category_filter;
    if (color !== undefined) finalUpdates.color = color;

    // Regenerate slug when name changes, with retry on collision
    if (name) {
      finalUpdates.slug = await generateUniqueSlug(
        supabase,
        partnershipId,
        name,
        budgetId
      );
    }

    const maxRetries = name ? 3 : 0;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0 && name) {
        // On retry, use a random suffix to avoid the same collision
        const crypto = await import("crypto");
        finalUpdates.slug = `${slugify(name)}-${crypto.randomBytes(2).toString("hex")}`;
      }

      const { data: result, error: updateError } = await supabase
        .from("user_budgets")
        .update(finalUpdates)
        .eq("id", budgetId)
        .eq("partnership_id", partnershipId)
        .select()
        .single();

      if (!updateError) {
        revalidatePath("/budget");
        return { data: result as UserBudget, error: null };
      }

      // 23505 = unique_violation — retry with different slug
      if (updateError.code === "23505" && attempt < maxRetries) {
        lastError = updateError;
        continue;
      }

      throw updateError;
    }

    throw lastError;
  } catch (err) {
    console.error("Failed to update budget:", err);
    return { data: null, error: "Failed to update budget" };
  }
}

// =====================================================
// DELETE
// =====================================================

export async function deleteBudget(budgetId: string) {
  const idParsed = z.string().uuid().safeParse(budgetId);
  if (!idParsed.success) return { error: "Invalid budget ID" };

  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Verify the budget belongs to the user's partnership
    const partnershipId = await getUserPartnershipId(supabase, user.id);
    if (!partnershipId) return { error: "No partnership found" };

    // Soft delete — mark inactive, scoped to user's partnership
    const { error } = await supabase
      .from("user_budgets")
      .update({ is_active: false, is_default: false })
      .eq("id", budgetId)
      .eq("partnership_id", partnershipId);

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
  const idParsed = z.string().uuid().safeParse(budgetId);
  const pidParsed = z.string().uuid().safeParse(partnershipId);
  if (!idParsed.success) return { error: "Invalid budget ID" };
  if (!pidParsed.success) return { error: "Invalid partnership ID" };

  const blocked = demoActionGuard();
  if (blocked) return blocked;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Verify the user is a member of the claimed partnership
    const userPartnershipId = await getUserPartnershipId(supabase, user.id);
    if (!userPartnershipId || userPartnershipId !== partnershipId) {
      return { error: "Not authorized for this partnership" };
    }

    // Clear existing defaults (exclude the target budget for efficiency)
    const { error: clearError } = await supabase
      .from("user_budgets")
      .update({ is_default: false })
      .eq("partnership_id", partnershipId)
      .eq("is_default", true)
      .neq("id", budgetId);

    if (clearError) throw clearError;

    // Optimistic concurrency check (M83): verify no other defaults remain
    // after the clear. If another concurrent request set a different default
    // between our clear and this check, we detect it here.
    const { count: remainingDefaults } = await supabase
      .from("user_budgets")
      .select("*", { count: "exact", head: true })
      .eq("partnership_id", partnershipId)
      .eq("is_default", true)
      .neq("id", budgetId);

    if (remainingDefaults && remainingDefaults > 0) {
      // Another concurrent request set a default — retry the clear once
      const { error: retryError } = await supabase
        .from("user_budgets")
        .update({ is_default: false })
        .eq("partnership_id", partnershipId)
        .eq("is_default", true)
        .neq("id", budgetId);

      if (retryError) throw retryError;
    }

    // Set new default, scoped to user's partnership.
    // The unique partial index on (partnership_id) WHERE is_default = true
    // acts as a final safety net — if another concurrent request already
    // set a different budget as default, this will fail with a unique
    // constraint violation rather than creating two defaults.
    const { error } = await supabase
      .from("user_budgets")
      .update({ is_default: true })
      .eq("id", budgetId)
      .eq("partnership_id", partnershipId);

    if (error) {
      // If this is a unique constraint violation from a concurrent race,
      // return a user-friendly message suggesting retry
      if (error.code === "23505") {
        return { error: "Another budget was just set as default. Please try again." };
      }
      throw error;
    }

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
  const idParsed = z.string().uuid().safeParse(budgetId);
  if (!idParsed.success) return { data: null, error: "Invalid budget ID" };
  const nameParsed = z.string().min(1).max(100).safeParse(newName);
  if (!nameParsed.success) return { data: null, error: "Invalid budget name" };

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

    const userPartnershipId = await getUserPartnershipId(supabase, user.id);
    if (!userPartnershipId || original.partnership_id !== userPartnershipId) {
      throw new Error("Not authorized");
    }

    // Create duplicate with slug retry for concurrent safety
    const duplicateRow = {
      partnership_id: original.partnership_id,
      name: newName,
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
    };

    const { data: newBudget, error: createError } = await insertBudgetWithSlugRetry(
      supabase,
      duplicateRow,
      original.partnership_id,
      newName
    );

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
    return { data: newBudget as unknown as UserBudget, error: null };
  } catch (err) {
    console.error("Failed to duplicate budget:", err);
    return { data: null, error: "Failed to duplicate budget" };
  }
}
