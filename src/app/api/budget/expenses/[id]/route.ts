import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody, validateUuidParam } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

/**
 * PATCH - Update expense definition
 * DELETE - Delete expense definition
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const expenseUpdateSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    category_name: z.string().min(1).max(100).optional(),
    expected_amount_cents: z.number().int().optional(),
    recurrence_type: z.string().min(1).max(50).optional(),
    next_due_date: z.string().min(1).optional(),
    match_pattern: z.string().max(500).optional(),
    is_active: z.boolean().optional(),
    emoji: z.string().max(10).optional(),
    notes: z.string().max(1000).optional(),
    merchant_name: z.string().max(200).optional(),
  });
  const parsed = await parseBody(request, expenseUpdateSchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;
  const { id } = await params;

  const idError = validateUuidParam(id);
  if (idError) return idError;

  // Verify ownership through partnership
  const { data: expense } = await supabase
    .from("expense_definitions")
    .select("partnership_id")
    .eq("id", id)
    .maybeSingle();

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", expense.partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Body is already validated by Zod schema against the allowlist of fields.
  // Spread validated fields and add updated_at timestamp.
  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };

  // Update expense
  const { data: updated, error } = await supabase
    .from("expense_definitions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update expense:", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }

  // Re-match transactions whenever expense is updated
  // Backfill historical transactions with amount tolerance
  const hasMatchCriteria = updated.merchant_name || updated.match_pattern || updated.name;
  if (hasMatchCriteria) {
    try {
      const { matchExpenseToTransactions } = await import('@/lib/match-expense-transactions');
      const matchResult = await matchExpenseToTransactions(id, expense.partnership_id, {
        amountTolerancePercent: 10, // Match within ±10% of expected amount
        limitMonths: null, // Search all history
      });
    } catch (matchError) {
      console.error('Error re-matching transactions:', matchError);
      // Don't fail the update if matching fails
    }
  }

  return NextResponse.json({ success: true, expense: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  const idError = validateUuidParam(id);
  if (idError) return idError;

  // Fetch expense with created_by to check creator authorization
  const { data: expense } = await supabase
    .from("expense_definitions")
    .select("partnership_id, created_by")
    .eq("id", id)
    .maybeSingle();

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  // Verify membership and get role
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id, role")
    .eq("user_id", user.id)
    .eq("partnership_id", expense.partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Only the partnership owner or the expense creator can delete
  const isOwner = membership.role === "owner";
  const isCreator = expense.created_by === user.id;
  if (!isOwner && !isCreator) {
    return NextResponse.json(
      { error: "Only the partnership owner or expense creator can delete expenses" },
      { status: 403 }
    );
  }

  // Soft-delete: set is_active = false instead of hard delete
  const { error } = await supabase
    .from("expense_definitions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Failed to delete expense:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
