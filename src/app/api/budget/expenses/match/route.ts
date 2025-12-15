import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { calculateNextDueDate } from "@/lib/budget-zero-calculations";
import { isDemoMode, demoModeResponse } from "@/lib/demo-guard";
import { verifyPartnershipMembership } from "@/lib/verify-partnership";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const matchSchema = z.object({
    expense_id: z.string().uuid(),
    transaction_id: z.string().uuid(),
    confidence: z.number().min(0).max(1).optional(),
  });
  const parsed = await parseBody(request, matchSchema);
  if (parsed.response) return parsed.response;
  const { expense_id, transaction_id, confidence } = parsed.data;

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

  // Verify transaction belongs to a member of the same partnership
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
      .eq("partnership_id", expense.partnership_id)
      .maybeSingle();

    if (!txMembership) {
      return NextResponse.json({ error: "Transaction does not belong to your partnership" }, { status: 403 });
    }
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
    console.error("Failed to create expense match:", matchError);
    return NextResponse.json({ error: "Failed to match expense to transaction" }, { status: 500 });
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
        { error: "Match created but failed to advance due date" },
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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
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
    console.error("Failed to delete expense match:", error);
    return NextResponse.json({ error: "Failed to unmatch expense" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
