import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

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

  const body = await request.json();
  const { id } = await params;

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

  // Update expense
  const { data: updated, error } = await supabase
    .from("expense_definitions")
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { id } = await params;

  // Verify ownership
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

  // Delete expense (cascade deletes matches)
  const { error } = await supabase
    .from("expense_definitions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
