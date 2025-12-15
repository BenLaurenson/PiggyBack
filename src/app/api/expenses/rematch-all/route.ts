/**
 * API Route: Rematch all expense definitions to transactions
 * This finds new transactions that match expense patterns and creates expense_matches
 */

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { matchExpenseToTransactions } from "@/lib/match-expense-transactions";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Get all active expense definitions for the partnership
    const { data: expenses, error: expensesError } = await supabase
      .from("expense_definitions")
      .select("id, name, match_pattern")
      .eq("partnership_id", membership.partnership_id)
      .eq("is_active", true);

    if (expensesError) {
      console.error("Error fetching expenses:", expensesError);
      return NextResponse.json({ error: expensesError.message }, { status: 500 });
    }

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ message: "No expenses to match", matched: 0 });
    }

    // Match each expense to transactions
    const results = await Promise.all(
      expenses.map(async (expense) => {
        // Only match expenses that have a pattern
        if (!expense.match_pattern) {
          return { id: expense.id, name: expense.name, matched: 0, skipped: true };
        }

        const result = await matchExpenseToTransactions(
          expense.id,
          membership.partnership_id
        );

        return {
          id: expense.id,
          name: expense.name,
          matched: result.matched,
          error: result.error,
        };
      })
    );

    const totalMatched = results.reduce((sum, r) => sum + (r.matched || 0), 0);
    const errors = results.filter(r => r.error);

    return NextResponse.json({
      message: `Matched ${totalMatched} new transactions`,
      totalMatched,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Rematch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rematch" },
      { status: 500 }
    );
  }
}
