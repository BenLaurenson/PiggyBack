import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { validateLayoutConfig } from "@/lib/layout-persistence";

/**
 * GET /api/budget/templates
 * Fetch all custom templates for a user
 *
 * Query params:
 * - partnership_id: string (required)
 * - user_id: string (required)
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

  if (!partnershipId || !userId) {
    return NextResponse.json(
      { error: "Missing partnership_id or user_id" },
      { status: 400 }
    );
  }

  // Verify user owns the request
  if (userId !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { data: templates, error } = await supabase
      .from("budget_layout_presets")
      .select("id, name, description, layout_config, created_at, updated_at")
      .eq("user_id", userId)
      .eq("partnership_id", partnershipId)
      .eq("is_template", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: templates || [] });

  } catch (error) {
    console.error("Templates fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/templates
 * Save current layout as a new template
 *
 * Body:
 * {
 *   partnership_id: string,
 *   user_id: string,
 *   name: string,
 *   description?: string,
 *   layout_config: LayoutConfig
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
    description,
    layout_config,
  } = body;

  if (!partnership_id || !user_id || !name || !layout_config) {
    return NextResponse.json(
      { error: "Missing required fields" },
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
    // Check if template with same name already exists
    const { data: existing } = await supabase
      .from("budget_layout_presets")
      .select("id")
      .eq("user_id", user_id)
      .eq("partnership_id", partnership_id)
      .eq("is_template", true)
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "A template with this name already exists" },
        { status: 409 }
      );
    }

    // Insert new template
    const { data: template, error } = await supabase
      .from("budget_layout_presets")
      .insert({
        user_id,
        partnership_id,
        name,
        description: description || null,
        layout_config,
        is_active: false, // Templates are never "active" - they're copied to active layouts
        is_template: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to save template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ template });

  } catch (error) {
    console.error("Template save error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/templates
 * Delete a custom template
 *
 * Query params:
 * - template_id: string (required)
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("template_id");

  if (!templateId) {
    return NextResponse.json(
      { error: "Missing template_id" },
      { status: 400 }
    );
  }

  try {
    // Fetch template to check ownership
    const { data: template, error: fetchError } = await supabase
      .from("budget_layout_presets")
      .select("*")
      .eq("id", templateId)
      .eq("is_template", true)
      .maybeSingle();

    if (fetchError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (template.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete template
    const { error: deleteError } = await supabase
      .from("budget_layout_presets")
      .delete()
      .eq("id", templateId);

    if (deleteError) {
      console.error("Database error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Template delete error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
