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

    // Get all active expense definitions for the partnership
    const { data: expenses, error: expensesError } = await supabase
      .from("expense_definitions")
      .select("id, name, merchant_name, match_pattern, expected_amount_cents")
      .eq("partnership_id", membership.partnership_id)
      .eq("is_active", true)
      .limit(200);

    if (expensesError) {
      console.error("Error fetching expenses:", expensesError);
      return NextResponse.json({ error: "Failed to fetch expenses for backfill" }, { status: 500 });
    }

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ message: "No expenses to backfill", totalMatched: 0 });
    }

    // Match each expense to transactions with full history and amount tolerance
    // Process in batches to avoid thundering herd on the database
    const BATCH_SIZE = 5;
    const results: Array<{
      id: string;
      name: string;
      matched?: number;
      skipped?: boolean;
      reason?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
      const batch = expenses.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (expense) => {
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
      results.push(...batchResults);
    }

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
      { error: "Failed to backfill expenses" },
      { status: 500 }
    );
  }
}
