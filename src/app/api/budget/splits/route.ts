import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

/**
 * GET - List split settings for partnership
 * POST - Create or update split setting
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");

  if (!partnershipId) {
    return NextResponse.json({ error: "Missing partnership_id" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Fetch all split settings
  const { data: settings, error } = await supabase
    .from("couple_split_settings")
    .select("*")
    .eq("partnership_id", partnershipId)
    .limit(100);

  if (error) {
    console.error("Failed to fetch split settings:", error);
    return NextResponse.json({ error: "Failed to fetch split settings" }, { status: 500 });
  }

  return NextResponse.json({ settings });
}

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

  const splitSchema = z.object({
    partnership_id: z.string().uuid(),
    category_name: z.string().max(100).optional(),
    expense_definition_id: z.string().uuid().optional(),
    split_type: z.enum(['equal', 'custom', 'individual-owner', 'individual-partner']),
    owner_percentage: z.number().min(0).max(100).optional(),
    notes: z.string().max(500).optional(),
  });
  const parsed = await parseBody(request, splitSchema);
  if (parsed.response) return parsed.response;
  const {
    partnership_id,
    category_name,
    expense_definition_id,
    split_type,
    owner_percentage,
    notes,
  } = parsed.data;

  // Verify membership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Validate owner_percentage for custom splits
  if (split_type === 'custom' && (owner_percentage === undefined || owner_percentage < 0 || owner_percentage > 100)) {
    return NextResponse.json({ error: "Invalid owner_percentage for custom split" }, { status: 400 });
  }

  // DELETE + INSERT instead of upsert because onConflict with nullable columns
  // (category_name, expense_definition_id) fails in PostgreSQL: NULL != NULL,
  // so upsert never finds existing rows with NULLs and creates unlimited duplicates.
  const categoryValue = category_name || null;
  const expenseDefValue = expense_definition_id || null;

  let deleteQuery = supabase
    .from("couple_split_settings")
    .delete()
    .eq("partnership_id", partnership_id);

  if (categoryValue === null) {
    deleteQuery = deleteQuery.is("category_name", null);
  } else {
    deleteQuery = deleteQuery.eq("category_name", categoryValue);
  }

  if (expenseDefValue === null) {
    deleteQuery = deleteQuery.is("expense_definition_id", null);
  } else {
    deleteQuery = deleteQuery.eq("expense_definition_id", expenseDefValue);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    console.error("Failed to delete existing split setting:", deleteError);
    return NextResponse.json({ error: "Failed to save split setting" }, { status: 500 });
  }

  const { data: setting, error } = await supabase
    .from("couple_split_settings")
    .insert({
      partnership_id,
      category_name: categoryValue,
      expense_definition_id: expenseDefValue,
      split_type,
      owner_percentage: split_type === 'custom' ? owner_percentage : null,
      notes,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save split setting:", error);
    return NextResponse.json({ error: "Failed to save split setting" }, { status: 500 });
  }

  return NextResponse.json({ success: true, setting });
}

/**
 * DELETE - Remove split setting (revert to default)
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
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Verify ownership
  const { data: setting } = await supabase
    .from("couple_split_settings")
    .select("partnership_id")
    .eq("id", id)
    .maybeSingle();

  if (!setting) {
    return NextResponse.json({ error: "Setting not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", setting.partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Delete setting
  const { error } = await supabase
    .from("couple_split_settings")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete split setting:", error);
    return NextResponse.json({ error: "Failed to delete split setting" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
