import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

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
    .order("category_name")
    .limit(100);

  if (error) {
    console.error("Failed to fetch category shares:", error);
    return NextResponse.json({ error: "Failed to fetch category shares" }, { status: 500 });
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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const shareSchema = z.object({
    partnership_id: z.string().uuid(),
    category_name: z.string().min(1).max(100),
    is_shared: z.boolean().optional(),
    share_percentage: z.number().min(0).max(100).optional(),
  });
  const parsed = await parseBody(request, shareSchema);
  if (parsed.response) return parsed.response;
  const { partnership_id, category_name, is_shared, share_percentage } = parsed.data;

  const percentage = share_percentage ?? 50;

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
    return NextResponse.json({ error: "Failed to save category share" }, { status: 500 });
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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
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
    return NextResponse.json({ error: "Failed to delete category share" }, { status: 500 });
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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const bulkShareSchema = z.object({
    partnership_id: z.string().uuid(),
    shares: z.array(z.object({
      category_name: z.string().min(1).max(100),
      is_shared: z.boolean().optional(),
      share_percentage: z.number().min(0).max(100).optional(),
    })).min(1).max(100),
  });
  const parsed = await parseBody(request, bulkShareSchema);
  if (parsed.response) return parsed.response;
  const { partnership_id, shares } = parsed.data;

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
    return NextResponse.json({ error: "Failed to update category shares" }, { status: 500 });
  }

  return NextResponse.json({ shares: data || [] });
}
