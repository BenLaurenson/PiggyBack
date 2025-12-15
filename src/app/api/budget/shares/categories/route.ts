import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/budget/shares/categories
 * Fetch all category share settings for a partnership
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");

  if (!partnershipId) {
    return NextResponse.json({ error: "Partnership ID required" }, { status: 400 });
  }

  // Verify user belongs to partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  // Fetch category shares
  const { data: shares, error } = await supabase
    .from("budget_category_shares")
    .select("*")
    .eq("partnership_id", partnershipId)
    .order("category_name");

  if (error) {
    console.error("Failed to fetch category shares:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shares: shares || [] });
}

/**
 * POST /api/budget/shares/categories
 * Create or update a category share setting
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { partnership_id, category_name, is_shared, share_percentage } = body;

  if (!partnership_id || !category_name) {
    return NextResponse.json(
      { error: "Partnership ID and category name required" },
      { status: 400 }
    );
  }

  // Validate percentage
  const percentage = share_percentage ?? 50;
  if (percentage < 0 || percentage > 100) {
    return NextResponse.json(
      { error: "Share percentage must be between 0 and 100" },
      { status: 400 }
    );
  }

  // Verify user belongs to partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  // Upsert category share
  const { data, error } = await supabase
    .from("budget_category_shares")
    .upsert(
      {
        partnership_id,
        category_name,
        is_shared: is_shared ?? false,
        share_percentage: percentage,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "partnership_id,category_name",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("Failed to save category share:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ share: data });
}

/**
 * DELETE /api/budget/shares/categories
 * Remove sharing from a category (resets to personal)
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const categoryName = searchParams.get("category_name");

  if (!partnershipId || !categoryName) {
    return NextResponse.json(
      { error: "Partnership ID and category name required" },
      { status: 400 }
    );
  }

  // Verify user belongs to partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  // Delete category share
  const { error } = await supabase
    .from("budget_category_shares")
    .delete()
    .eq("partnership_id", partnershipId)
    .eq("category_name", categoryName);

  if (error) {
    console.error("Failed to delete category share:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/budget/shares/categories
 * Bulk update multiple category shares at once
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { partnership_id, shares } = body;

  if (!partnership_id || !Array.isArray(shares)) {
    return NextResponse.json(
      { error: "Partnership ID and shares array required" },
      { status: 400 }
    );
  }

  // Verify user belongs to partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  // Prepare upsert data
  const upsertData = shares.map((share: any) => ({
    partnership_id,
    category_name: share.category_name,
    is_shared: share.is_shared ?? false,
    share_percentage: share.share_percentage ?? 50,
    updated_at: new Date().toISOString(),
  }));

  // Bulk upsert
  const { data, error } = await supabase
    .from("budget_category_shares")
    .upsert(upsertData, {
      onConflict: "partnership_id,category_name",
    })
    .select();

  if (error) {
    console.error("Failed to bulk update category shares:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shares: data || [] });
}
