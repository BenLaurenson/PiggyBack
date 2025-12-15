import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { validateLayoutConfig } from "@/lib/layout-persistence";

/**
 * GET /api/budget/layout
 * Fetch active layout or specific layout
 *
 * Query params:
 * - partnership_id: string (required)
 * - user_id: string (required)
 * - layout_id: string (optional - fetch specific layout)
 * - budget_view: 'individual' | 'shared' (optional - defaults to 'shared')
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const userId = searchParams.get("user_id");
  const layoutId = searchParams.get("layout_id");
  const budgetView = searchParams.get("budget_view") || "shared";
  const budgetId = searchParams.get("budget_id");

  if (!partnershipId || !userId) {
    return NextResponse.json(
      { error: "Missing partnership_id or user_id" },
      { status: 400 }
    );
  }

  // Validate budget_view
  if (budgetView !== "individual" && budgetView !== "shared") {
    return NextResponse.json(
      { error: "Invalid budget_view. Must be 'individual' or 'shared'" },
      { status: 400 }
    );
  }

  // Verify user owns the request
  if (userId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    let query = supabase
      .from("budget_layout_presets")
      .select("*")
      .eq("user_id", userId)
      .eq("partnership_id", partnershipId);

    // Scope to budget_id
    if (budgetId) {
      query = query.eq("budget_id", budgetId);
    } else {
      query = query.is("budget_id", null);
    }

    if (layoutId) {
      query = query.eq("id", layoutId);
    } else {
      // Fetch active layout for specific view
      query = query.eq("is_active", true).eq("budget_view", budgetView);
    }

    const { data: layout, error } = await query.maybeSingle();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch layout" },
        { status: 500 }
      );
    }

    return NextResponse.json({ layout });

  } catch (error) {
    console.error("Layout fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/layout
 * Create or update layout
 *
 * Body:
 * {
 *   partnership_id: string,
 *   user_id: string,
 *   name: string,
 *   layout_config: LayoutConfig,
 *   is_active: boolean,
 *   budget_view: 'individual' | 'shared' (optional - defaults to 'shared')
 * }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    partnership_id,
    user_id,
    name,
    layout_config,
    is_active,
    budget_view = "shared",
    budget_id,
  } = body;

  if (!partnership_id || !user_id || !name || !layout_config) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Validate budget_view
  if (budget_view !== "individual" && budget_view !== "shared") {
    return NextResponse.json(
      { error: "Invalid budget_view. Must be 'individual' or 'shared'" },
      { status: 400 }
    );
  }

  // Verify user owns the request
  if (user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Validate layout config
  const validation = validateLayoutConfig(layout_config);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  try {
    // If setting as active, deactivate other layouts for the SAME VIEW first
    if (is_active) {
      let deactivateQuery = supabase
        .from("budget_layout_presets")
        .update({ is_active: false })
        .eq("user_id", user_id)
        .eq("partnership_id", partnership_id)
        .eq("budget_view", budget_view)
        .eq("is_active", true);
      if (budget_id) {
        deactivateQuery = deactivateQuery.eq("budget_id", budget_id);
      } else {
        deactivateQuery = deactivateQuery.is("budget_id", null);
      }
      await deactivateQuery;
    }

    // Insert new layout
    const insertData: Record<string, any> = {
      user_id,
      partnership_id,
      name,
      layout_config,
      is_active: is_active ?? true,
      budget_view,
    };
    if (budget_id) insertData.budget_id = budget_id;

    const { data: layout, error } = await supabase
      .from("budget_layout_presets")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to save layout" },
        { status: 500 }
      );
    }

    return NextResponse.json({ layout });

  } catch (error) {
    console.error("Layout save error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/layout
 * Delete a layout
 *
 * Query params:
 * - layout_id: string (required)
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const layoutId = searchParams.get("layout_id");

  if (!layoutId) {
    return NextResponse.json(
      { error: "Missing layout_id" },
      { status: 400 }
    );
  }

  try {
    // Fetch layout to check ownership and active status
    const { data: layout, error: fetchError } = await supabase
      .from("budget_layout_presets")
      .select("*")
      .eq("id", layoutId)
      .maybeSingle();

    if (fetchError || !layout) {
      return NextResponse.json(
        { error: "Layout not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (layout.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Prevent deleting active layout
    if (layout.is_active) {
      return NextResponse.json(
        { error: "Cannot delete active layout. Please activate a different layout first." },
        { status: 400 }
      );
    }

    // Delete layout
    const { error: deleteError } = await supabase
      .from("budget_layout_presets")
      .delete()
      .eq("id", layoutId);

    if (deleteError) {
      console.error("Database error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete layout" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Layout delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
