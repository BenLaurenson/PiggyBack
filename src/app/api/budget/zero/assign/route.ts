import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { isDemoMode, demoModeResponse } from "@/lib/demo-guard";
import { verifyPartnershipMembership } from "@/lib/verify-partnership";

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

  const body = await request.json();
  const {
    partnership_id,
    month,
    category_name,
    subcategory_name,  // For subcategory-level budgeting
    goal_id,
    asset_id,
    assignment_type = 'category',
    assigned_cents,
    budget_view = 'shared',  // Which view this assignment belongs to
    budget_id,  // Multi-budget scoping
  } = body;

  if (!partnership_id || !month || assigned_cents === undefined) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

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

  // Validate budget_view
  if (budget_view !== 'individual' && budget_view !== 'shared') {
    return NextResponse.json(
      { error: "Invalid budget_view. Must be 'individual' or 'shared'" },
      { status: 400 }
    );
  }

  // Check if assignment already exists
  // (The unique index is complex with COALESCE, so we do manual upsert)
  let existingQuery = supabase
    .from("budget_assignments")
    .select("id")
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
    // Update existing
    const { data, error: updateError } = await supabase
      .from("budget_assignments")
      .update({
        assigned_cents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
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
        const { data: retryData, error: retryError } = await supabase
          .from("budget_assignments")
          .update({
            assigned_cents,
            updated_at: new Date().toISOString(),
          })
          .eq("id", retryExisting.id)
          .select()
          .single();
        assignment = retryData;
        error = retryError;
      }
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, assignment });
}
