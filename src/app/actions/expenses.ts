"use server";

import { z } from "zod/v4";
import { createClient } from "@/utils/supabase/server";
import { getPeriodForTransaction } from "@/lib/expense-period-utils";
import { demoActionGuard } from "@/lib/demo-guard";
import type { ActionResult } from "@/types/action-result";
import { ok, fail } from "@/types/action-result";
import { safeErrorMessage, escapeLikePattern } from "@/lib/safe-error";

// =====================================================
// ZOD SCHEMAS
// =====================================================

const createExpenseOptionsSchema = z.object({
  customName: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  recurrence: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly", "one-time", "irregular"]).optional(),
  expectedAmountCents: z.number().int().min(0).max(100_000_000_00).optional(), // max $100M in cents
  nextDueDate: z.string().max(50).optional(),
});

/**
 * Typed result for vendor transaction history queries.
 */
export interface VendorTransaction {
  id: string;
  up_transaction_id: string | null;
  description: string;
  amount_cents: number;
  created_at: string;
  status: string;
  merchant_name: string | null;
  category_name: string | null;
}

/**
 * Create expense definition from transaction (enhanced with up_transaction_id)
 * Stores Up Bank transaction ID instead of regex pattern
 */
export async function createExpenseFromTransaction(
  transactionId: string,
  options: {
    customName?: string;
    category?: string;
    recurrence?: string;
    expectedAmountCents?: number;
    nextDueDate?: string;
  } = {}
): Promise<{ success: boolean; expense?: Record<string, unknown>; error?: string }> {
  const idParsed = z.string().uuid().safeParse(transactionId);
  if (!idParsed.success) return { success: false, error: "Invalid transaction ID" };
  const optsParsed = createExpenseOptionsSchema.safeParse(options);
  if (!optsParsed.success) return { success: false, error: "Invalid options: " + optsParsed.error.issues.map(i => i.message).join(", ") };
  options = optsParsed.data;

  const blocked = demoActionGuard(); if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();

    // 1. Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 2. Get transaction (simple query, no complex joins)
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (txError) {
      console.error('Transaction query error:', txError);
      throw new Error("Transaction query failed");
    }

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // 3. Verify user owns this account
    const { data: account } = await supabase
      .from('accounts')
      .select('user_id')
      .eq('id', transaction.account_id)
      .maybeSingle();

    if (!account || account.user_id !== user.id) {
      throw new Error('Unauthorized');
    }

    // 4. Get user's partnership
    const { data: membership } = await supabase
      .from('partnership_members')
      .select('partnership_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) throw new Error('Please set up your budget first');

    const partnershipId = membership.partnership_id;

    // 5. Determine expense details
    const expenseName = options.customName || transaction.description;
    const amountCents = options.expectedAmountCents || Math.abs(transaction.amount_cents);

    // Calculate next due date (default: 1 month from now)
    let nextDueDate = options.nextDueDate;
    if (!nextDueDate) {
      const dueDate = new Date(transaction.created_at);
      if (options.recurrence === 'weekly') {
        dueDate.setDate(dueDate.getDate() + 7);
      } else if (options.recurrence === 'fortnightly') {
        dueDate.setDate(dueDate.getDate() + 14);
      } else if (options.recurrence === 'quarterly') {
        dueDate.setMonth(dueDate.getMonth() + 3);
      } else if (options.recurrence === 'yearly') {
        dueDate.setFullYear(dueDate.getFullYear() + 1);
      } else {
        // Default: monthly
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
      nextDueDate = dueDate.toISOString();
    }

    // 6. Create expense definition
    // Map 'irregular' to 'one-time' (database constraint doesn't allow 'irregular')
    const recurrenceType = options.recurrence === 'irregular' ? 'one-time' : (options.recurrence || 'monthly');

    const { data: expense, error: expenseError } = await supabase
      .from('expense_definitions')
      .insert({
        partnership_id: partnershipId,
        name: expenseName,
        merchant_name: transaction.description, // Store immutable merchant name for URLs
        category_name: options.category || 'Other',
        expected_amount_cents: amountCents,
        recurrence_type: recurrenceType,
        next_due_date: nextDueDate,
        is_active: true,
        auto_detected: true,
        linked_up_transaction_id: transaction.up_transaction_id,
        match_pattern: `${transaction.description}%`,
        notes: `Created from transaction: ${transaction.description}`,
      })
      .select()
      .single();

    if (expenseError) {
      console.error('Database error creating expense:', expenseError);
      throw new Error("Failed to create expense");
    }

    // 7. Create transaction_reference entry (if up_transaction_id exists)
    if (transaction.up_transaction_id) {
      const { error: refError } = await supabase
        .from('transaction_references')
        .insert({
          up_transaction_id: transaction.up_transaction_id,
          reference_type: 'expense_definition',
          reference_id: expense.id,
        });

      if (refError) {
        // Non-critical, continue
      }
    }

    // 8. Create initial expense_match for this transaction
    // Calculate the billing period this payment covers
    const txnDate = transaction.settled_at || transaction.created_at;
    const forPeriod = getPeriodForTransaction(txnDate, recurrenceType);

    const { error: matchError } = await supabase
      .from('expense_matches')
      .insert({
        expense_definition_id: expense.id,
        transaction_id: transactionId,
        match_confidence: 1.0,
        matched_at: new Date().toISOString(),
        for_period: forPeriod, // Track which billing period this covers
      });

    if (matchError) {
      console.error('Failed to create expense_match:', matchError);
      // Continue anyway, the expense was created
    }

    // 9. Match ALL historical transactions with same pattern
    const { matchExpenseToTransactions } = await import('@/lib/match-expense-transactions');
    const matchResult = await matchExpenseToTransactions(
      expense.id,
      partnershipId
    );

    return { success: true, expense };
  } catch (error) {
    return {
      success: false,
      error: safeErrorMessage(error, "Failed to create expense"),
    };
  }
}

/**
 * Check if a transaction is already linked to a recurring expense.
 * Returns the linked expense details or null.
 */
export async function getExpenseForTransaction(
  transactionId: string
): Promise<{
  linked: boolean;
  expense?: { id: string; name: string; emoji: string | null };
}> {
  const idParsed = z.string().uuid().safeParse(transactionId);
  if (!idParsed.success) return { linked: false };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { linked: false };

    // Verify the transaction belongs to the user's account
    const { data: transaction } = await supabase
      .from("transactions")
      .select("account_id")
      .eq("id", transactionId)
      .maybeSingle();

    if (transaction) {
      const { data: account } = await supabase
        .from("accounts")
        .select("user_id")
        .eq("id", transaction.account_id)
        .maybeSingle();

      if (!account || account.user_id !== user.id) {
        return { linked: false };
      }
    }

    const { data: match } = await supabase
      .from("expense_matches")
      .select("expense_definition_id, expense_definitions(id, name, emoji)")
      .eq("transaction_id", transactionId)
      .limit(1)
      .maybeSingle();

    if (!match || !match.expense_definitions) return { linked: false };

    const exp = match.expense_definitions as any;
    return {
      linked: true,
      expense: { id: exp.id, name: exp.name, emoji: exp.emoji ?? null },
    };
  } catch (error) {
    console.error("getExpenseForTransaction error:", error);
    return { linked: false };
  }
}

/**
 * Delete a recurring expense definition.
 * Soft-deletes by setting is_active = false (preserves expense_matches history).
 * Only the partnership owner or the expense creator can delete.
 */
export async function deleteExpense(
  expenseId: string
): Promise<ActionResult> {
  const idParsed = z.string().uuid().safeParse(expenseId);
  if (!idParsed.success) return fail("Invalid expense ID");

  const blocked = demoActionGuard();
  if (blocked) return fail(blocked.error);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Not authenticated");

    // Fetch expense with created_by to check creator authorization
    const { data: expense } = await supabase
      .from("expense_definitions")
      .select("partnership_id, name, created_by")
      .eq("id", expenseId)
      .maybeSingle();

    if (!expense) return fail("Expense not found");

    // Verify membership and get role
    const { data: membership } = await supabase
      .from("partnership_members")
      .select("partnership_id, role")
      .eq("user_id", user.id)
      .eq("partnership_id", expense.partnership_id)
      .maybeSingle();

    if (!membership) return fail("Not authorized");

    // Only the partnership owner or the expense creator can delete
    const isOwner = membership.role === "owner";
    const isCreator = expense.created_by === user.id;
    if (!isOwner && !isCreator) {
      return fail("Only the partnership owner or expense creator can delete expenses");
    }

    // Soft-delete: set is_active = false instead of hard delete
    // This preserves expense_matches history and allows recovery
    const { error } = await supabase
      .from("expense_definitions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", expenseId);

    if (error) return fail(safeErrorMessage(error, "Failed to delete expense"));

    return ok();
  } catch (error) {
    return fail(safeErrorMessage(error, "Failed to delete expense"));
  }
}

/**
 * Get vendor transaction history
 * Find all transactions matching a vendor/description pattern
 */
export async function getVendorTransactionHistory(
  partnershipId: string,
  vendorPattern: string
): Promise<{ transactions: VendorTransaction[]; error?: string }> {
  const pidParsed = z.string().uuid().safeParse(partnershipId);
  if (!pidParsed.success) return { transactions: [], error: "Invalid partnership ID" };
  const patternParsed = z.string().min(1).max(200).safeParse(vendorPattern);
  if (!patternParsed.success) return { transactions: [], error: "Invalid vendor pattern" };

  const blocked = demoActionGuard(); if (blocked) return { transactions: [], error: blocked.error };
  try {
    const supabase = await createClient();

    // 1. Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 2. Verify partnership
    const { data: partnership } = await supabase
      .from('partnerships')
      .select('id')
      .eq('id', partnershipId)
      .or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`)
      .maybeSingle();

    if (!partnership) {
      throw new Error('Unauthorized');
    }

    // 3. Get accounts in partnership
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, partnerships!inner(id)')
      .eq('partnerships.id', partnershipId);

    const accountIds = accounts?.map(a => a.id) || [];

    // 4. Find transactions matching vendor pattern
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        id,
        up_transaction_id,
        description,
        amount_cents,
        created_at,
        status,
        merchant_name,
        category_name
      `)
      .in('account_id', accountIds)
      .ilike('description', `%${escapeLikePattern(vendorPattern)}%`)
      .lt('amount_cents', 0) // Only expenses
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return { transactions: transactions || [] };
  } catch (error) {
    return {
      transactions: [],
      error: safeErrorMessage(error, "Failed to get transaction history"),
    };
  }
}
