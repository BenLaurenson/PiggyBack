import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { validateLayoutConfig } from "@/lib/layout-persistence";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

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
 * If an active layout already exists for this user+partnership+view+budget_id,
 * it is updated in-place (with an optimistic concurrency check via updated_at)
 * rather than deactivating + inserting, which was racy.
 *
 * Body:
 * {
 *   partnership_id: string,
 *   user_id: string,
 *   name: string,
 *   layout_config: LayoutConfig,
 *   is_active: boolean,
 *   budget_view: 'individual' | 'shared' (optional - defaults to 'shared')
 *   expected_updated_at?: string (ISO timestamp for optimistic concurrency)
 * }
 */
export async function POST(request: Request) {
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

  const layoutSchema = z.object({
    partnership_id: z.string().uuid(),
    user_id: z.string().uuid(),
    name: z.string().min(1).max(100),
    layout_config: z.record(z.string(), z.unknown()),
    is_active: z.boolean().optional(),
    budget_view: z.enum(["individual", "shared"]).default("shared"),
    budget_id: z.string().uuid().optional(),
    expected_updated_at: z.string().optional(),
  });
  const parsed = await parseBody(request, layoutSchema);
  if (parsed.response) return parsed.response;
  const {
    partnership_id,
    user_id,
    name,
    layout_config,
    is_active,
    budget_view,
    budget_id,
    expected_updated_at,
  } = parsed.data;

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
    // Try to find existing active layout for this user+partnership+view
    let existingQuery = supabase
      .from("budget_layout_presets")
      .select("id, updated_at")
      .eq("user_id", user_id)
      .eq("partnership_id", partnership_id)
      .eq("budget_view", budget_view)
      .eq("is_active", true);

    if (budget_id) {
      existingQuery = existingQuery.eq("budget_id", budget_id);
    } else {
      existingQuery = existingQuery.is("budget_id", null);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      // Update existing layout in-place (no deactivate+insert race)
      let updateQuery = supabase
        .from("budget_layout_presets")
        .update({
          name,
          layout_config,
          is_active: is_active ?? true,
          updated_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      // Optimistic concurrency: if caller provided expected_updated_at,
      // only update if the row hasn't been modified since they last read it.
      if (expected_updated_at) {
        updateQuery = updateQuery.eq("updated_at", expected_updated_at);
      }

      const { data: layout, error } = await updateQuery.select().maybeSingle();

      if (error) {
        console.error("Database error:", error);
        return NextResponse.json(
          { error: "Failed to save layout" },
          { status: 500 }
        );
      }

      // If optimistic concurrency check failed (row was modified), return 409
      if (!layout && expected_updated_at) {
        return NextResponse.json(
          { error: "Layout was modified by another request. Please refresh and try again." },
          { status: 409 }
        );
      }

      // If no row was returned but no expected_updated_at was set,
      // fall through to insert (shouldn't happen but defensive)
      if (layout) {
        return NextResponse.json({ layout });
      }
    }

    // No existing active layout — insert a new one.
    // Deactivate any stale active layouts first (defensive, shouldn't normally exist).
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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
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
