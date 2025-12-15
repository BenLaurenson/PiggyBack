import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/budget/transaction-overrides
 * Fetch a single transaction override by transaction_id and partnership_id
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const transactionId = searchParams.get("transaction_id");

  if (!partnershipId || !transactionId) {
    return NextResponse.json(
      { error: "Partnership ID and transaction ID required" },
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
    return NextResponse.json(
      { error: "Not a member of this partnership" },
      { status: 403 }
    );
  }

  // Fetch transaction override
  const { data: override, error } = await supabase
    .from("transaction_share_overrides")
    .select("*")
    .eq("partnership_id", partnershipId)
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch transaction override:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ override: override || null });
}

/**
 * POST /api/budget/transaction-overrides
 * Create or update a transaction override (upsert)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    partnership_id,
    transaction_id,
    is_shared,
    share_percentage,
    category_name,
    notes,
  } = body;

  // Validate required fields
  if (!partnership_id || !transaction_id) {
    return NextResponse.json(
      { error: "Partnership ID and transaction ID required" },
      { status: 400 }
    );
  }

  // Validate share_percentage
  if (share_percentage !== undefined) {
    if (typeof share_percentage !== 'number' || share_percentage < 0 || share_percentage > 100) {
      return NextResponse.json(
        { error: "Share percentage must be between 0 and 100" },
        { status: 400 }
      );
    }
  }

  // Verify user belongs to partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this partnership" },
      { status: 403 }
    );
  }

  // Upsert transaction override
  const { data, error } = await supabase
    .from("transaction_share_overrides")
    .upsert(
      {
        partnership_id,
        transaction_id,
        is_shared: is_shared ?? true,
        share_percentage: share_percentage ?? 50,
        category_name: category_name || null,
        notes: notes || null,
        created_by_user_id: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "transaction_id,partnership_id",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("Failed to save transaction override:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ override: data });
}

/**
 * DELETE /api/budget/transaction-overrides
 * Remove a transaction override
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const transactionId = searchParams.get("transaction_id");

  if (!partnershipId || !transactionId) {
    return NextResponse.json(
      { error: "Partnership ID and transaction ID required" },
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
    return NextResponse.json(
      { error: "Not a member of this partnership" },
      { status: 403 }
    );
  }

  // Delete transaction override
  const { error } = await supabase
    .from("transaction_share_overrides")
    .delete()
    .eq("partnership_id", partnershipId)
    .eq("transaction_id", transactionId);

  if (error) {
    console.error("Failed to delete transaction override:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
