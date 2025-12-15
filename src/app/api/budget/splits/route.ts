import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

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
    .eq("partnership_id", partnershipId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    partnership_id,
    category_name,
    expense_definition_id,
    split_type,
    owner_percentage,
    notes,
  } = body;

  if (!partnership_id || !split_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

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

  // Validate split_type
  if (!['equal', 'custom', 'individual-owner', 'individual-partner'].includes(split_type)) {
    return NextResponse.json({ error: "Invalid split_type" }, { status: 400 });
  }

  // Validate owner_percentage for custom splits
  if (split_type === 'custom' && (owner_percentage === undefined || owner_percentage < 0 || owner_percentage > 100)) {
    return NextResponse.json({ error: "Invalid owner_percentage for custom split" }, { status: 400 });
  }

  // Upsert split setting
  const { data: setting, error } = await supabase
    .from("couple_split_settings")
    .upsert({
      partnership_id,
      category_name: category_name || null,
      expense_definition_id: expense_definition_id || null,
      split_type,
      owner_percentage: split_type === 'custom' ? owner_percentage : null,
      notes,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'partnership_id,category_name,expense_definition_id',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
