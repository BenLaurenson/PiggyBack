import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { calculateNextDueDate } from "@/lib/budget-zero-calculations";
import { isDemoMode, demoModeResponse } from "@/lib/demo-guard";
import { verifyPartnershipMembership } from "@/lib/verify-partnership";

/**
 * POST - Match expense to transaction
 * Creates expense_match and updates expense next_due_date
 */
export async function POST(request: Request) {
  if (isDemoMode()) return demoModeResponse();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { expense_id, transaction_id, confidence } = body;

  if (!expense_id || !transaction_id) {
    return NextResponse.json({ error: "Missing expense_id or transaction_id" }, { status: 400 });
  }

  // Verify expense ownership
  const { data: expense } = await supabase
    .from("expense_definitions")
    .select("partnership_id, recurrence_type, next_due_date")
    .eq("id", expense_id)
    .maybeSingle();

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  const verification = await verifyPartnershipMembership(supabase, user.id, expense.partnership_id);

  if (!verification.valid) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Create expense match
  const { error: matchError } = await supabase
    .from("expense_matches")
    .insert({
      expense_definition_id: expense_id,
      transaction_id,
      match_confidence: confidence || 1.0,
      matched_by: user.id,
    });

  if (matchError) {
    // Check if transaction already matched
    if (matchError.code === '23505') { // Unique constraint violation
      return NextResponse.json({ error: "Transaction already matched to an expense" }, { status: 400 });
    }
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  // Update expense next_due_date (if recurring)
  if (expense.recurrence_type !== 'one-time') {
    const currentDueDate = new Date(expense.next_due_date);
    const nextDueDate = calculateNextDueDate(currentDueDate, expense.recurrence_type);

    const { error: updateError } = await supabase
      .from("expense_definitions")
      .update({
        next_due_date: nextDueDate.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", expense_id);

    if (updateError) {
      console.error("Error advancing next_due_date:", updateError);
      return NextResponse.json(
        { error: "Match created but failed to advance next_due_date", detail: updateError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE - Unmatch expense from transaction
 * Defense-in-depth: verifies partnership membership before deleting
 */
export async function DELETE(request: Request) {
  if (isDemoMode()) return demoModeResponse();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get("transaction_id");

  if (!transactionId) {
    return NextResponse.json({ error: "Missing transaction_id" }, { status: 400 });
  }

  // Look up the match to find the associated expense definition
  const { data: match } = await supabase
    .from("expense_matches")
    .select("expense_definition_id")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Look up the expense to find the partnership
  const { data: expense } = await supabase
    .from("expense_definitions")
    .select("partnership_id")
    .eq("id", match.expense_definition_id)
    .maybeSingle();

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  // Verify the user is a member of the partnership that owns this expense
  const verification = await verifyPartnershipMembership(supabase, user.id, expense.partnership_id);

  if (!verification.valid) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Delete match
  const { error } = await supabase
    .from("expense_matches")
    .delete()
    .eq("transaction_id", transactionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
