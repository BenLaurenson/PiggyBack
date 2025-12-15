import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/**
 * Get or update partnership budgeting methodology
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

  // Verify user is member of partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  const { data: methodology } = await supabase
    .from("partnership_budget_methodology")
    .select("*, budgeting_methodologies(*)")
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  return NextResponse.json({
    methodology: methodology?.budgeting_methodologies?.name || 'zero-based',
    data: methodology,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { partnership_id, methodology } = body;

  if (!partnership_id || !methodology) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify user is member of partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  // Save to profiles table
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      budget_methodology: methodology,
    })
    .eq("id", user.id);

  if (profileError) {
    console.error("Error saving methodology:", profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
