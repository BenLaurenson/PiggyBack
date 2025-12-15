/**
 * API Route: Recalculate for_period for all existing expense matches
 * This fixes incorrect for_period values in the database
 */

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getPeriodForTransaction } from "@/lib/expense-period-utils";
import { batchOperationLimiter, getClientIp, rateLimitKey } from "@/lib/rate-limiter";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const rateLimitResult = batchOperationLimiter.check(rateLimitKey(user.id, ip));
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 0) / 1000)) } }
      );
    }

    // Get user's partnership
    const { data: membership } = await supabase
      .from("partnership_members")
      .select("partnership_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Please set up your budget first" }, { status: 404 });
    }

    // Get all expense definitions with their matches and transactions
    const { data: expenses, error: expensesError } = await supabase
      .from("expense_definitions")
      .select(`
        id,
        name,
        recurrence_type,
        expense_matches (
          id,
          transaction_id,
          for_period,
          transactions (
            settled_at,
            created_at
          )
        )
      `)
      .eq("partnership_id", membership.partnership_id)
      .eq("is_active", true)
      .limit(200);

    if (expensesError) {
      console.error("Error fetching expenses:", expensesError);
      return NextResponse.json({ error: "Failed to fetch expenses for period recalculation" }, { status: 500 });
    }

    let totalUpdated = 0;
    const updates: { expense: string; matchId: string; oldPeriod: string; newPeriod: string }[] = [];

    // Process each expense and its matches
    for (const expense of expenses || []) {
      const matches = expense.expense_matches || [];

      for (const match of matches) {
        // Handle Supabase type inference - transactions may be returned as array or object
        const txnData = match.transactions;
        const txn = Array.isArray(txnData) ? txnData[0] : txnData;
        if (!txn) continue;

        // Calculate correct for_period based on transaction date and recurrence
        const txnDate = txn.settled_at || txn.created_at;
        const correctPeriod = getPeriodForTransaction(txnDate, expense.recurrence_type);

        // Only update if different
        if (match.for_period !== correctPeriod) {
          const { error: updateError } = await supabase
            .from("expense_matches")
            .update({ for_period: correctPeriod })
            .eq("id", match.id);

          if (!updateError) {
            totalUpdated++;
            updates.push({
              expense: expense.name,
              matchId: match.id,
              oldPeriod: match.for_period || "(none)",
              newPeriod: correctPeriod,
            });
          }
        }
      }
    }

    return NextResponse.json({
      message: `Updated ${totalUpdated} expense match periods`,
      totalUpdated,
      updates: updates.slice(0, 20), // Return first 20 for debugging
    });
  } catch (error) {
    console.error("Recalculate periods error:", error);
    return NextResponse.json(
      { error: "Failed to recalculate expense periods" },
      { status: 500 }
    );
  }
}
