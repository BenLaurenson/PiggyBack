import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getPeriodForTransaction } from "@/lib/expense-period-utils";
import { calculateNextDueDate } from "@/lib/budget-zero-calculations";
import { generalApiLimiter } from "@/lib/rate-limiter";
import { validateUuidParam } from "@/lib/validation";

/**
 * POST /api/notifications/[id]/action
 * Take action on a notification.
 *
 * Body:
 *   { action: "update_amount" } - Update the expense amount and link the transaction
 *   { action: "dismiss" } - Dismiss the notification
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const body = await request.json();
  const { action } = body;

  if (!action || !["update_amount", "dismiss"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Use 'update_amount' or 'dismiss'." },
      { status: 400 }
    );
  }

  // Fetch the notification and verify ownership
  const { data: notification, error: fetchError } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !notification) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404 }
    );
  }

  if (notification.actioned) {
    return NextResponse.json(
      { error: "Notification already actioned" },
      { status: 400 }
    );
  }

  if (action === "update_amount") {
    const metadata = notification.metadata as {
      expense_id?: string;
      transaction_id?: string;
      new_amount_cents?: number;
      expense_name?: string;
    };

    if (!metadata.expense_id || !metadata.transaction_id || !metadata.new_amount_cents) {
      return NextResponse.json(
        { error: "Notification missing required metadata" },
        { status: 400 }
      );
    }

    // Verify the user has access to this expense via partnership membership
    const { data: expense } = await supabase
      .from("expense_definitions")
      .select("id, partnership_id, recurrence_type, next_due_date")
      .eq("id", metadata.expense_id)
      .single();

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    const { data: membership } = await supabase
      .from("partnership_members")
      .select("partnership_id")
      .eq("user_id", user.id)
      .eq("partnership_id", expense.partnership_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Update the expense amount
    const { error: updateError } = await supabase
      .from("expense_definitions")
      .update({
        expected_amount_cents: metadata.new_amount_cents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", metadata.expense_id);

    if (updateError) {
      console.error("Error updating expense amount:", updateError);
      return NextResponse.json(
        { error: "Failed to update expense amount" },
        { status: 500 }
      );
    }

    // Get the transaction date for period calculation
    const { data: transaction } = await supabase
      .from("transactions")
      .select("settled_at, created_at")
      .eq("id", metadata.transaction_id)
      .single();

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const txnDate = transaction.settled_at || transaction.created_at;
    const forPeriod = getPeriodForTransaction(txnDate, expense.recurrence_type);

    // Link the transaction to the expense
    const { error: matchError } = await supabase
      .from("expense_matches")
      .upsert(
        {
          expense_definition_id: metadata.expense_id,
          transaction_id: metadata.transaction_id,
          match_confidence: 1.0,
          matched_by: user.id,
          for_period: forPeriod,
        },
        { onConflict: "transaction_id", ignoreDuplicates: true }
      );

    if (matchError) {
      console.error("Error linking transaction:", matchError);
      // Don't fail the whole action — the amount was already updated
    }

    // Advance next_due_date past the transaction date (same logic as auto-matcher)
    if (expense.recurrence_type !== "one-time" && expense.next_due_date) {
      const currentDueDate = new Date(expense.next_due_date);
      const txnDateObj = new Date(txnDate);

      let nextDue = new Date(currentDueDate);
      while (nextDue <= txnDateObj) {
        nextDue = calculateNextDueDate(nextDue, expense.recurrence_type);
      }

      if (nextDue.getTime() !== currentDueDate.getTime()) {
        await supabase
          .from("expense_definitions")
          .update({
            next_due_date: nextDue.toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          })
          .eq("id", metadata.expense_id);
      }
    }
  }

  // Mark notification as actioned and read
  const { error: actionError } = await supabase
    .from("notifications")
    .update({ actioned: true, read: true })
    .eq("id", id);

  if (actionError) {
    console.error("Error marking notification as actioned:", actionError);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
