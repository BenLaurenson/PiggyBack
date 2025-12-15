'use server';

import { createClient } from '@/utils/supabase/server';
import { createUpApiClient } from '@/lib/up-api';
import { revalidatePath } from 'next/cache';
import { analyzeIncomePattern } from '@/lib/income-pattern-analysis';
import { getPlaintextToken } from '@/lib/token-encryption';

/**
 * Sync income tags from Up Bank to local database
 */
export async function syncIncomeTagsFromUpBank(): Promise<{
  synced: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // 1. Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 2. Get Up Bank API config
    const { data: config } = await supabase
      .from('up_api_configs')
      .select('encrypted_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!config?.encrypted_token) {
      throw new Error('Up Bank not connected');
    }

    // 3. Fetch ALL transactions with 'Income' tag from Up Bank (with pagination)
    const upClient = createUpApiClient(getPlaintextToken(config.encrypted_token));
    const firstPage = await upClient.getTransactions({
      filterTag: 'Income',
      pageSize: 100
    });
    const incomeTransactions = await upClient.getAllPages(firstPage);

    let syncedCount = 0;

    // 4. For each transaction, update local database
    for (const upTransaction of incomeTransactions) {
      // Find corresponding local transaction by up_transaction_id
      const { data: localTransaction } = await supabase
        .from('transactions')
        .select('id, account_id, accounts!inner(user_id)')
        .eq('up_transaction_id', upTransaction.id)
        .maybeSingle();

      if (localTransaction && (localTransaction.accounts as any).user_id === user.id) {
        // Update is_income flag
        await supabase
          .from('transactions')
          .update({ is_income: true })
          .eq('id', localTransaction.id);

        // Update transaction_tags
        await supabase
          .from('tags')
          .upsert({ name: 'Income' }, { onConflict: 'name' });

        await supabase
          .from('transaction_tags')
          .upsert({
            transaction_id: localTransaction.id,
            tag_name: 'Income'
          }, { onConflict: 'transaction_id,tag_name' });

        syncedCount++;
      }
    }

    // 5. Revalidate paths
    revalidatePath('/activity');
    revalidatePath('/home');
    revalidatePath('/settings/income');
    revalidatePath('/analysis');

    return { synced: syncedCount };
  } catch (error) {
    console.error('syncIncomeTagsFromUpBank error:', error);
    return {
      synced: 0,
      error: error instanceof Error ? error.message : 'Failed to sync income tags'
    };
  }
}

/**
 * Create income source from transaction (enhanced with up_transaction_id linking)
 * Supports both recurring salary and one-off income
 */
export async function createIncomeSourceFromTransaction(
  transactionId: string,
  mode: 'recurring' | 'one-off',
  options: {
    customName?: string;
    oneOffType?: 'bonus' | 'gift' | 'dividend' | 'tax-refund' | 'freelance' | 'other';
  } = {}
): Promise<{ success: boolean; incomeSource?: any; error?: string }> {
  try {
    const supabase = await createClient();

    // 1. Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 2. Get transaction and verify ownership
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (txError) {
      throw new Error('Transaction not found');
    }
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Verify user owns this account
    const { data: account } = await supabase
      .from('accounts')
      .select('user_id')
      .eq('id', transaction.account_id)
      .maybeSingle();

    if (!account || account.user_id !== user.id) {
      throw new Error('Unauthorized');
    }

    // Get user's partnership
    const { data: membership } = await supabase
      .from('partnership_members')
      .select('partnership_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const partnershipId = membership?.partnership_id;

    // CHECK FOR EXISTING: Prevent duplicates by checking linked_up_transaction_id
    const { data: existingSource } = await supabase
      .from('income_sources')
      .select('*')
      .eq('linked_up_transaction_id', transaction.up_transaction_id)
      .eq('is_active', true)
      .maybeSingle();

    if (existingSource) {
      // Return existing instead of creating duplicate
      return { success: true, incomeSource: existingSource };
    }

    // 3. Update transaction flags
    await supabase
      .from('transactions')
      .update({
        is_income: true,
        is_one_off_income: mode === 'one-off',
        income_type: mode === 'one-off' ? options.oneOffType || 'other' : 'salary',
      })
      .eq('id', transactionId);

    let incomeSourceData: any;

    if (mode === 'one-off') {
      // One-off income source
      const sourceName = options.customName || `${options.oneOffType || 'Income'} - ${transaction.description}`;

      incomeSourceData = {
        user_id: user.id,
        partnership_id: partnershipId,
        name: sourceName,
        source_type: 'one-off',
        one_off_type: options.oneOffType || 'other',
        amount_cents: transaction.amount_cents,
        received_date: transaction.created_at,
        notes: `Created from transaction: ${transaction.description}`,
        is_active: true,
        linked_up_transaction_id: transaction.up_transaction_id,
      };
    } else {
      // Recurring salary - analyze pattern
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', user.id);

      const accountIds = accounts?.map(a => a.id) || [];

      // Get all transactions with same description
      const { data: patternTransactions } = await supabase
        .from('transactions')
        .select('*')
        .in('account_id', accountIds)
        .eq('description', transaction.description)
        .order('created_at', { ascending: true });

      // Analyze pattern
      const pattern = analyzeIncomePattern(patternTransactions || [transaction]);

      const sourceName = options.customName || transaction.description;

      incomeSourceData = {
        user_id: user.id,
        partnership_id: partnershipId,
        name: sourceName,
        source_type: 'recurring-salary',
        amount_cents: pattern.lastPayAmountCents,
        frequency: pattern.frequency !== 'unknown' ? pattern.frequency : 'monthly',
        last_pay_date: transaction.created_at,
        next_pay_date: pattern.nextPredictedPayDate,
        notes: `Created from transaction: ${transaction.description}`,
        is_active: true,
        linked_up_transaction_id: transaction.up_transaction_id,
        match_pattern: `${transaction.description}%`, // For backward compatibility
      };
    }

    // 5. Create income source
    const { data: incomeSource, error: sourceError } = await supabase
      .from('income_sources')
      .insert(incomeSourceData)
      .select()
      .single();

    if (sourceError) {
      console.error('Failed to create income source:', sourceError);
      throw new Error(`Database error: ${sourceError.message || sourceError.code || JSON.stringify(sourceError)}`);
    }

    // 6. Create transaction_reference entry
    await supabase
      .from('transaction_references')
      .insert({
        up_transaction_id: transaction.up_transaction_id,
        reference_type: 'income_source',
        reference_id: incomeSource.id,
      });

    // 7. Revalidate paths
    revalidatePath('/activity');
    revalidatePath('/home');
    revalidatePath('/settings/income');
    revalidatePath('/analysis');

    return { success: true, incomeSource };
  } catch (error) {
    console.error('createIncomeSourceFromTransaction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create income source',
    };
  }
}
