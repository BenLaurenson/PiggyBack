import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

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
    return NextResponse.json({ error: "Failed to fetch transaction override" }, { status: 500 });
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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const overrideSchema = z.object({
    partnership_id: z.string().uuid(),
    transaction_id: z.string().uuid(),
    is_shared: z.boolean().optional(),
    share_percentage: z.number().min(0).max(100).optional(),
    category_name: z.string().max(100).optional(),
    notes: z.string().max(500).optional(),
  });
  const parsed = await parseBody(request, overrideSchema);
  if (parsed.response) return parsed.response;
  const {
    partnership_id,
    transaction_id,
    is_shared,
    share_percentage,
    category_name,
    notes,
  } = parsed.data;

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

  // Verify transaction belongs to a member of this partnership
  const { data: transaction } = await supabase
    .from("transactions")
    .select("account_id, accounts!inner(user_id)")
    .eq("id", transaction_id)
    .maybeSingle();

  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const txUserId = (transaction as any).accounts?.user_id;
  if (txUserId) {
    const { data: txMembership } = await supabase
      .from("partnership_members")
      .select("partnership_id")
      .eq("user_id", txUserId)
      .eq("partnership_id", partnership_id)
      .maybeSingle();

    if (!txMembership) {
      return NextResponse.json(
        { error: "Transaction does not belong to your partnership" },
        { status: 403 }
      );
    }
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
    return NextResponse.json({ error: "Failed to save transaction override" }, { status: 500 });
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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
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
    return NextResponse.json({ error: "Failed to delete transaction override" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
