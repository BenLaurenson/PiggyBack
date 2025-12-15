import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { isDemoMode, demoModeResponse } from "@/lib/demo-guard";
import { verifyPartnershipMembership } from "@/lib/verify-partnership";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

/**
 * Create or update budget assignment for a category
 * POST /api/budget/zero/assign
 *
 * Body includes budget_view to support separate My Budget / Our Budget assignments.
 * Assignments are stored in the budget's native period. Totals are calculated
 * fresh from raw data by /api/budget/summary.
 */
export async function POST(request: Request) {
  if (isDemoMode()) return demoModeResponse();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const assignSchema = z.object({
    partnership_id: z.string().uuid(),
    month: z.string().min(1).max(20),
    category_name: z.string().max(100).optional(),
    subcategory_name: z.string().max(100).optional(),
    goal_id: z.string().uuid().optional(),
    asset_id: z.string().uuid().optional(),
    assignment_type: z.string().max(50).default('category'),
    assigned_cents: z.number().int(),
    budget_view: z.enum(['individual', 'shared']).default('shared'),
    budget_id: z.string().uuid().optional(),
  });
  const parsed = await parseBody(request, assignSchema);
  if (parsed.response) return parsed.response;
  const {
    partnership_id,
    month,
    category_name,
    subcategory_name,
    goal_id,
    asset_id,
    assignment_type,
    assigned_cents,
    budget_view,
    budget_id,
  } = parsed.data;

  // Validate that only one target is set
  const hasCategory = !!category_name;
  const hasGoal = !!goal_id;
  const hasAsset = !!asset_id;
  const targetCount = [hasCategory, hasGoal, hasAsset].filter(Boolean).length;

  if (targetCount !== 1) {
    return NextResponse.json(
      { error: "Must specify exactly one of: category_name, goal_id, or asset_id" },
      { status: 400 }
    );
  }

  // Verify user is member of partnership
  const verification = await verifyPartnershipMembership(supabase, user.id, partnership_id);

  if (!verification.valid) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  // Verify goal_id belongs to the same partnership
  if (goal_id) {
    const { data: goal } = await supabase
      .from("savings_goals")
      .select("id")
      .eq("id", goal_id)
      .eq("partnership_id", partnership_id)
      .maybeSingle();

    if (!goal) {
      return NextResponse.json({ error: "Goal not found in this partnership" }, { status: 403 });
    }
  }

  // Verify asset_id belongs to the same partnership
  if (asset_id) {
    const { data: asset } = await supabase
      .from("investments")
      .select("id")
      .eq("id", asset_id)
      .eq("partnership_id", partnership_id)
      .maybeSingle();

    if (!asset) {
      return NextResponse.json({ error: "Asset not found in this partnership" }, { status: 403 });
    }
  }

  // Check if assignment already exists
  // (The unique index is complex with COALESCE, so we do manual upsert)
  let existingQuery = supabase
    .from("budget_assignments")
    .select("id, updated_at")
    .eq("partnership_id", partnership_id)
    .eq("month", month)
    .eq("assignment_type", assignment_type)
    .eq("budget_view", budget_view);  // Include budget_view in uniqueness check

  // Scope to budget_id
  if (budget_id) {
    existingQuery = existingQuery.eq("budget_id", budget_id);
  } else {
    existingQuery = existingQuery.is("budget_id", null);
  }

  if (category_name) {
    existingQuery = existingQuery.eq("category_name", category_name);
    // Handle subcategory-level vs parent-level assignments
    if (subcategory_name) {
      existingQuery = existingQuery.eq("subcategory_name", subcategory_name);
    } else {
      existingQuery = existingQuery.is("subcategory_name", null);
    }
  }
  if (goal_id) existingQuery = existingQuery.eq("goal_id", goal_id);
  if (asset_id) existingQuery = existingQuery.eq("asset_id", asset_id);

  const { data: existing } = await existingQuery.maybeSingle();

  let assignment;
  let error;

  if (existing) {
    // Update existing with optimistic concurrency check:
    // Only update if the row hasn't been modified since we read it.
    let updateQuery = supabase
      .from("budget_assignments")
      .update({
        assigned_cents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (existing.updated_at) {
      updateQuery = updateQuery.eq("updated_at", existing.updated_at);
    } else {
      updateQuery = updateQuery.is("updated_at", null);
    }

    const { data, error: updateError } = await updateQuery
      .select()
      .single();

    // If no rows matched, a concurrent update modified this row first
    if (updateError?.code === 'PGRST116' && !data) {
      return NextResponse.json(
        { error: "Assignment was modified by another request. Please refresh and try again." },
        { status: 409 }
      );
    }

    assignment = data;
    error = updateError;
  } else {
    // Insert new
    const assignmentData: Record<string, string | number | null> = {
      partnership_id,
      month,
      assignment_type,
      category_name: category_name || "",
      assigned_cents,
      budget_view,  // Store which view this assignment belongs to
      created_by: user.id,
    };
    if (budget_id) assignmentData.budget_id = budget_id;

    if (subcategory_name) assignmentData.subcategory_name = subcategory_name;
    if (goal_id) assignmentData.goal_id = goal_id;
    if (asset_id) assignmentData.asset_id = asset_id;

    const { data, error: insertError } = await supabase
      .from("budget_assignments")
      .insert(assignmentData)
      .select()
      .single();
    assignment = data;
    error = insertError;

    // Handle race condition: if a concurrent request inserted the same row
    // between our SELECT check and this INSERT, retry as an UPDATE
    if (insertError?.code === '23505') {
      const { data: retryExisting } = await existingQuery.maybeSingle();
      if (retryExisting) {
        let retryUpdateQuery = supabase
          .from("budget_assignments")
          .update({
            assigned_cents,
            updated_at: new Date().toISOString(),
          })
          .eq("id", retryExisting.id);

        if (retryExisting.updated_at) {
          retryUpdateQuery = retryUpdateQuery.eq("updated_at", retryExisting.updated_at);
        } else {
          retryUpdateQuery = retryUpdateQuery.is("updated_at", null);
        }

        const { data: retryData, error: retryError } = await retryUpdateQuery
          .select()
          .single();

        if (retryError?.code === 'PGRST116' && !retryData) {
          return NextResponse.json(
            { error: "Assignment was modified by another request. Please refresh and try again." },
            { status: 409 }
          );
        }

        assignment = retryData;
        error = retryError;
      }
    }
  }

  if (error) {
    console.error("Failed to save budget assignment:", error);
    return NextResponse.json({ error: "Failed to save budget assignment" }, { status: 500 });
  }

  return NextResponse.json({ success: true, assignment });
}
