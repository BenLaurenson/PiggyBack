/**
 * API Route: Backfill all expense definitions with historical transactions
 * This matches all past transactions to expense definitions using:
 * - Merchant name matching (case-insensitive)
 * - Amount tolerance (±10%)
 * - Full transaction history (no date limit)
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
      .select("id, name, merchant_name, match_pattern, expected_amount_cents")
      .eq("partnership_id", membership.partnership_id)
      .eq("is_active", true);

    if (expensesError) {
      console.error("Error fetching expenses:", expensesError);
      return NextResponse.json({ error: expensesError.message }, { status: 500 });
    }

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ message: "No expenses to backfill", totalMatched: 0 });
    }

    // Match each expense to transactions with full history and amount tolerance
    const results = await Promise.all(
      expenses.map(async (expense) => {
        // Skip expenses without merchant_name or match_pattern
        const hasMatchCriteria = expense.merchant_name || expense.match_pattern;
        if (!hasMatchCriteria) {
          return {
            id: expense.id,
            name: expense.name,
            matched: 0,
            skipped: true,
            reason: "No merchant name or pattern",
          };
        }

        const result = await matchExpenseToTransactions(
          expense.id,
          membership.partnership_id,
          {
            amountTolerancePercent: 10, // Match within ±10% of expected amount
            limitMonths: null, // Search ALL history
          }
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
    const skipped = results.filter(r => r.skipped);
    const successful = results.filter(r => r.matched && r.matched > 0);

    return NextResponse.json({
      message: `Backfilled ${totalMatched} transactions across ${successful.length} expenses`,
      totalMatched,
      totalExpenses: expenses.length,
      results: results.slice(0, 50), // Return first 50 for debugging
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to backfill" },
      { status: 500 }
    );
  }
}
