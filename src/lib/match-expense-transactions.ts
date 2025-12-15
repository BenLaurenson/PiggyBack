/**
 * Expense Transaction Matching Utilities
 *
 * Two matching functions:
 * 1. matchExpenseToTransactions - Batch match all transactions to a single expense
 * 2. matchSingleTransactionToExpenses - Match a single transaction to all matching expenses (webhook use)
 *
 * Both use exact merchant_name matching (case-insensitive) instead of regex patterns
 */

import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getPeriodForTransaction } from "@/lib/expense-period-utils";
import { calculateNextDueDate } from "@/lib/budget-zero-calculations";
import { SupabaseClient } from "@supabase/supabase-js";

/** Shared amount tolerance percentage used by both batch and webhook matching */
export const AMOUNT_TOLERANCE_PERCENT = 10;

export interface MatchOptions {
  /** Amount tolerance as percentage (e.g., 10 = ±10%). Default: 10 */
  amountTolerancePercent?: number;
  /** Number of months to look back, or null for all history. Default: null (all history) */
  limitMonths?: number | null;
}

/**
 * Match all historical transactions to a specific expense definition
 * Called when creating a new expense or running rematch
 *
 * @param expenseId - The expense definition ID to match
 * @param partnershipId - The partnership ID for account lookup
 * @param options - Optional matching configuration
 */
export async function matchExpenseToTransactions(
  expenseId: string,
  partnershipId: string,
  options?: MatchOptions
): Promise<{ matched: number; error?: string }> {
  try {
    const supabase = await createClient();

    // 1. Get expense definition with merchant_name
    const { data: expense, error: expenseError } = await supabase
      .from('expense_definitions')
      .select('merchant_name, match_pattern, expected_amount_cents, recurrence_type, next_due_date')
      .eq('id', expenseId)
      .single();

    if (expenseError || !expense) {
      return { matched: 0, error: 'Expense not found' };
    }

    // Use merchant_name for matching, fallback to match_pattern for legacy expenses
    const matchValue = expense.merchant_name || expense.match_pattern;
    if (!matchValue) {
      return { matched: 0, error: 'No merchant name or pattern set' };
    }

    // 2. Get partnership member accounts
    const { data: members } = await supabase
      .from('partnership_members')
      .select('user_id')
      .eq('partnership_id', partnershipId);

    const userIds = members?.map(m => m.user_id) || [];

    const { data: accounts } = await supabase
      .from('accounts')
      .select('id')
      .in('user_id', userIds)
      .eq('is_active', true);

    const accountIds = accounts?.map(a => a.id) || [];

    if (accountIds.length === 0) {
      return { matched: 0, error: 'No accounts found' };
    }

    // 3. Find all transactions matching merchant_name (case-insensitive exact match)
    // Apply options with defaults
    const amountTolerance = options?.amountTolerancePercent ?? 10; // Default ±10%
    const limitMonths = options?.limitMonths; // Default null (all history)

    // Build query
    let query = supabase
      .from('transactions')
      .select('id, description, amount_cents, created_at, settled_at')
      .in('account_id', accountIds)
      .lt('amount_cents', 0) // Only expenses
      .is('transfer_account_id', null) // Exclude transfers
      .order('created_at', { ascending: false });

    // Apply date limit if specified
    if (limitMonths !== null && limitMonths !== undefined) {
      const limitDate = new Date();
      limitDate.setMonth(limitDate.getMonth() - limitMonths);
      query = query.gte('created_at', limitDate.toISOString());
    }

    // Use pattern matching with wildcards for partial merchant name match
    // This allows "Deft Real Estate" to match "DEFT REAL ESTATE PTY LTD PERTH WA AU"
    if (expense.merchant_name) {
      query = query.ilike('description', `%${expense.merchant_name}%`);
    } else if (expense.match_pattern) {
      // Legacy match_pattern - use as-is (may already contain wildcards)
      query = query.ilike('description', expense.match_pattern);
    }

    const { data: matchingTransactions } = await query;

    if (!matchingTransactions || matchingTransactions.length === 0) {
      return { matched: 0 };
    }

    // 4. Filter by amount tolerance (if expected_amount_cents is set)
    let filteredTransactions = matchingTransactions;
    if (expense.expected_amount_cents && expense.expected_amount_cents > 0) {
      const expectedAmount = expense.expected_amount_cents;
      const minAmount = expectedAmount * (1 - amountTolerance / 100);
      const maxAmount = expectedAmount * (1 + amountTolerance / 100);

      filteredTransactions = matchingTransactions.filter(t => {
        // Transaction amounts are negative, so take absolute value
        const txnAmount = Math.abs(t.amount_cents);
        return txnAmount >= minAmount && txnAmount <= maxAmount;
      });

      if (filteredTransactions.length === 0) {
        return { matched: 0 };
      }
    }

    // 5. Get already matched transaction IDs to avoid duplicates
    const { data: existingMatches } = await supabase
      .from('expense_matches')
      .select('transaction_id')
      .eq('expense_definition_id', expenseId);

    const alreadyMatchedIds = new Set(existingMatches?.map(m => m.transaction_id) || []);

    // 6. Create matches for unmatched transactions
    const newMatches = filteredTransactions
      .filter(t => !alreadyMatchedIds.has(t.id))
      .map(t => {
        // Use settled_at or created_at to determine the billing period
        const txnDate = t.settled_at || t.created_at;
        const forPeriod = getPeriodForTransaction(txnDate, expense.recurrence_type);

        return {
          expense_definition_id: expenseId,
          transaction_id: t.id,
          match_confidence: 0.95, // High confidence for exact merchant name match
          matched_by: null, // Auto-matched
          for_period: forPeriod, // Track which billing period this covers
        };
      });

    if (newMatches.length === 0) {
      return { matched: 0 }; // All already matched
    }

    // 7. Insert new matches
    const { error: insertError } = await supabase
      .from('expense_matches')
      .insert(newMatches);

    if (insertError) {
      console.error('Error inserting expense matches:', insertError);
      return { matched: 0, error: insertError.message };
    }

    // 8. Advance next_due_date past the latest matched transaction
    if (expense.recurrence_type !== 'one-time' && expense.next_due_date) {
      const latestTxnDate = filteredTransactions.reduce((latest, t) => {
        const txnDate = new Date(t.settled_at || t.created_at);
        return txnDate > latest ? txnDate : latest;
      }, new Date(0));

      const currentDueDate = new Date(expense.next_due_date);

      // Keep advancing next_due_date until it's in the future relative to the latest transaction
      let nextDue = new Date(currentDueDate);
      while (nextDue <= latestTxnDate) {
        nextDue = calculateNextDueDate(nextDue, expense.recurrence_type);
      }

      // Only update if the date actually changed
      if (nextDue.getTime() !== currentDueDate.getTime()) {
        await supabase
          .from('expense_definitions')
          .update({
            next_due_date: nextDue.toISOString().split('T')[0],
            updated_at: new Date().toISOString(),
          })
          .eq('id', expenseId);

      }
    }

    return { matched: newMatches.length };
  } catch (error) {
    console.error('matchExpenseToTransactions error:', error);
    return {
      matched: 0,
      error: error instanceof Error ? error.message : 'Failed to match transactions',
    };
  }
}

/**
 * Match a single transaction to all expense definitions with matching merchant_name
 * Called by webhook handler when new transactions arrive
 * Uses service role client since webhooks don't have user session context
 */
export async function matchSingleTransactionToExpenses(
  transactionId: string,
  description: string,
  accountId: string,
  transactionDate: string,
  amountCents: number
): Promise<{ matched: string[]; error?: string }> {
  try {
    // Only match expense transactions (negative amounts)
    if (amountCents >= 0) {
      return { matched: [] };
    }

    // Use service role client since this is called from webhook (no user session)
    const supabase = createServiceRoleClient();

    // 1. Get the account's user to find their partnership
    const { data: account } = await supabase
      .from('accounts')
      .select('user_id')
      .eq('id', accountId)
      .single();

    if (!account) {
      return { matched: [], error: 'Account not found' };
    }

    // 2. Get partnership for this user
    const { data: membership } = await supabase
      .from('partnership_members')
      .select('partnership_id')
      .eq('user_id', account.user_id)
      .single();

    if (!membership) {
      // User might not be in a partnership, that's okay
      return { matched: [] };
    }

    // 3. Find all active expense definitions with matching merchant_name
    // Case-insensitive partial match - check if merchant_name is contained in description
    // We fetch all expenses with merchant_name and filter client-side for partial matches
    const { data: allExpenses, error: expensesError } = await supabase
      .from('expense_definitions')
      .select('id, name, recurrence_type, merchant_name, expected_amount_cents, next_due_date')
      .eq('partnership_id', membership.partnership_id)
      .eq('is_active', true)
      .not('merchant_name', 'is', null);

    if (expensesError) {
      console.error('Error finding matching expenses:', expensesError);
      return { matched: [], error: expensesError.message };
    }

    // Filter for partial matches (merchant_name contained in description, case-insensitive)
    // Split into: amount-matching expenses and price-changed expenses
    const absAmount = Math.abs(amountCents);
    const merchantMatchedExpenses = allExpenses?.filter(expense => {
      return description.toLowerCase().includes(expense.merchant_name!.toLowerCase());
    }) || [];

    const matchingExpenses: typeof merchantMatchedExpenses = [];
    const priceChangedExpenses: typeof merchantMatchedExpenses = [];

    for (const expense of merchantMatchedExpenses) {
      if (expense.expected_amount_cents && expense.expected_amount_cents > 0) {
        const minAmount = expense.expected_amount_cents * (1 - AMOUNT_TOLERANCE_PERCENT / 100);
        const maxAmount = expense.expected_amount_cents * (1 + AMOUNT_TOLERANCE_PERCENT / 100);
        if (absAmount < minAmount || absAmount > maxAmount) {
          priceChangedExpenses.push(expense);
          continue;
        }
      }
      matchingExpenses.push(expense);
    }

    if (!matchingExpenses || matchingExpenses.length === 0) {
      // No matching expenses found, that's normal for most transactions
      return { matched: [] };
    }

    // 4. Check which expenses don't already have this transaction matched
    const expenseIds = matchingExpenses.map(e => e.id);
    const { data: existingMatches } = await supabase
      .from('expense_matches')
      .select('expense_definition_id')
      .eq('transaction_id', transactionId)
      .in('expense_definition_id', expenseIds);

    const alreadyMatchedExpenseIds = new Set(
      existingMatches?.map(m => m.expense_definition_id) || []
    );

    // 5. Create matches for expenses not already matched
    const expensesToMatch = matchingExpenses.filter(e => !alreadyMatchedExpenseIds.has(e.id));
    const newMatches = expensesToMatch.map(expense => {
      const forPeriod = getPeriodForTransaction(transactionDate, expense.recurrence_type);

      return {
        expense_definition_id: expense.id,
        transaction_id: transactionId,
        match_confidence: 0.95, // High confidence for exact merchant name match
        matched_by: null, // Auto-matched by webhook
        for_period: forPeriod,
      };
    });

    if (newMatches.length === 0) {
      return { matched: [] }; // All already matched
    }

    // 6. Upsert new matches with ON CONFLICT DO NOTHING to handle race conditions
    // (e.g., duplicate webhook deliveries for the same transaction)
    const { data: insertedRows, error: insertError } = await supabase
      .from('expense_matches')
      .upsert(newMatches, { onConflict: 'transaction_id', ignoreDuplicates: true })
      .select('expense_definition_id,transaction_id');

    if (insertError) {
      console.error('Error inserting expense matches:', insertError);
      return { matched: [], error: insertError.message };
    }

    // If no rows were actually inserted (all duplicates), skip advancement
    if (!insertedRows || insertedRows.length === 0) {
      return { matched: [] };
    }

    // Only advance next_due_date for expenses that had new matches inserted
    const insertedExpenseIds = new Set(insertedRows.map((r: any) => r.expense_definition_id));
    const actuallyMatchedExpenses = expensesToMatch.filter(e => insertedExpenseIds.has(e.id));

    // 7. Update next_due_date for each matched recurring expense
    for (const expense of actuallyMatchedExpenses) {
      if (expense.recurrence_type !== 'one-time' && expense.next_due_date) {
        const currentDueDate = new Date(expense.next_due_date);
        const txnDate = new Date(transactionDate);

        // Only advance if the transaction is near or after the due date
        // This prevents advancing due date for old historical transactions
        const daysDiff = (txnDate.getTime() - currentDueDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff >= -7) {
          // Keep advancing next_due_date until it's past the transaction date
          // (matches batch path behavior)
          let nextDue = new Date(currentDueDate);
          while (nextDue <= txnDate) {
            nextDue = calculateNextDueDate(nextDue, expense.recurrence_type);
          }

          // Only update if the date actually changed
          if (nextDue.getTime() !== currentDueDate.getTime()) {
            await supabase
              .from('expense_definitions')
              .update({
                next_due_date: nextDue.toISOString().split('T')[0],
                updated_at: new Date().toISOString(),
              })
              .eq('id', expense.id);

          }
        }
      }
    }

    const matchedExpenseNames = actuallyMatchedExpenses.map(e => e.name);

    // 8. Create notifications for price-changed expenses (merchant matches but amount outside tolerance)
    if (priceChangedExpenses.length > 0) {
      const { createNotification, isNotificationEnabled } = await import('@/lib/create-notification');

      // Check if user has price change notifications enabled
      const priceNotificationsEnabled = await isNotificationEnabled(supabase, account.user_id, 'subscription_price_change');
      if (!priceNotificationsEnabled) {
        // Skip - notifications disabled for this user
      }

      for (const expense of priceChangedExpenses) {
        if (!priceNotificationsEnabled) continue;
        // Check for existing unactioned notification for this expense to avoid duplicates
        const { data: existingNotification } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', account.user_id)
          .eq('type', 'subscription_price_change')
          .eq('actioned', false)
          .contains('metadata', { expense_id: expense.id })
          .maybeSingle();

        if (existingNotification) {
          continue; // Already notified about this expense
        }

        const oldAmount = (expense.expected_amount_cents! / 100).toFixed(2);
        const newAmount = (absAmount / 100).toFixed(2);

        await createNotification(supabase, {
          userId: account.user_id,
          type: 'subscription_price_change',
          title: `${expense.name} price changed`,
          message: `${expense.name} charged $${newAmount} instead of the expected $${oldAmount}. Would you like to update your subscription amount?`,
          metadata: {
            expense_id: expense.id,
            expense_name: expense.name,
            transaction_id: transactionId,
            old_amount_cents: expense.expected_amount_cents,
            new_amount_cents: absAmount,
            merchant_name: expense.merchant_name,
          },
        });

      }
    }

    return { matched: matchedExpenseNames };
  } catch (error) {
    console.error('matchSingleTransactionToExpenses error:', error);
    return {
      matched: [],
      error: error instanceof Error ? error.message : 'Failed to match transaction',
    };
  }
}

/**
 * Match a single income transaction to income_sources and advance next_pay_date.
 * Called by webhook handler when new positive-amount transactions arrive.
 * Mirrors matchSingleTransactionToExpenses but for income.
 */
export async function matchSingleTransactionToIncomeSources(
  transactionId: string,
  description: string,
  accountId: string,
  transactionDate: string,
  amountCents: number
): Promise<{ matched: string[]; error?: string }> {
  try {
    // Only match income transactions (positive amounts, non-trivial)
    if (amountCents <= 0) {
      return { matched: [] };
    }

    const supabase = createServiceRoleClient();

    // 1. Get the account's user to find their partnership
    const { data: account } = await supabase
      .from('accounts')
      .select('user_id')
      .eq('id', accountId)
      .single();

    if (!account) {
      return { matched: [], error: 'Account not found' };
    }

    // 2. Get partnership for this user
    const { data: membership } = await supabase
      .from('partnership_members')
      .select('partnership_id')
      .eq('user_id', account.user_id)
      .single();

    // 3. Fetch active recurring income sources
    const incomeQuery = membership
      ? supabase
          .from('income_sources')
          .select('id, name, match_pattern, frequency, next_pay_date, amount_cents')
          .eq('partnership_id', membership.partnership_id)
          .eq('is_active', true)
          .eq('source_type', 'recurring-salary')
      : supabase
          .from('income_sources')
          .select('id, name, match_pattern, frequency, next_pay_date, amount_cents')
          .eq('user_id', account.user_id)
          .eq('is_active', true)
          .eq('source_type', 'recurring-salary');

    const { data: incomeSources, error: sourcesError } = await incomeQuery;

    if (sourcesError) {
      console.error('Error finding income sources:', sourcesError);
      return { matched: [], error: sourcesError.message };
    }

    if (!incomeSources || incomeSources.length === 0) {
      return { matched: [] };
    }

    // 4. Find matching income sources by name or match_pattern
    const descLower = description.toLowerCase();
    const matchingSources = incomeSources.filter(source => {
      // Check match_pattern first (may contain wildcards like "%MRL%")
      if (source.match_pattern) {
        const pattern = source.match_pattern.replace(/%/g, '').toLowerCase();
        if (pattern && descLower.includes(pattern)) return true;
      }
      // Fall back to name substring match
      if (source.name && descLower.includes(source.name.toLowerCase())) return true;
      return false;
    });

    if (matchingSources.length === 0) {
      return { matched: [] };
    }

    const txnDate = new Date(transactionDate);
    const matchedNames: string[] = [];

    for (const source of matchingSources) {
      // 5. Update income source: last_pay_date, next_pay_date, amount
      const updates: Record<string, unknown> = {
        last_pay_date: txnDate.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      };

      // Update amount to match latest transaction
      if (amountCents !== source.amount_cents) {
        updates.amount_cents = amountCents;
      }

      // Advance next_pay_date based on frequency
      if (source.frequency) {
        const nextDate = new Date(txnDate);
        switch (source.frequency) {
          case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
          case 'fortnightly': nextDate.setDate(nextDate.getDate() + 14); break;
          case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
          case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
          case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
          case 'bi-monthly': nextDate.setMonth(nextDate.getMonth() + 2); break;
        }
        updates.next_pay_date = nextDate.toISOString().split('T')[0];
      }

      const { error: updateError } = await supabase
        .from('income_sources')
        .update(updates)
        .eq('id', source.id);

      if (updateError) {
        console.error(`Error updating income source ${source.name}:`, updateError);
        continue;
      }

      matchedNames.push(source.name);
    }

    // 6. Mark the transaction as income
    if (matchedNames.length > 0) {
      await supabase
        .from('transactions')
        .update({ is_income: true, income_type: 'salary' })
        .eq('id', transactionId);
    }

    return { matched: matchedNames };
  } catch (error) {
    console.error('matchSingleTransactionToIncomeSources error:', error);
    return {
      matched: [],
      error: error instanceof Error ? error.message : 'Failed to match income',
    };
  }
}
