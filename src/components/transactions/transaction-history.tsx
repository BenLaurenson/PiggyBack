"use client";

/**
 * Transaction History Component
 * Reusable component for displaying matched/paid transactions for an entity
 * Used for: expense payments, income deposits, goal contributions, etc.
 *
 * Fetches expense_matches or queries by merchant name
 */

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, History } from "lucide-react";
import { format } from "date-fns";

interface TransactionHistoryProps {
  /** Type of entity */
  entityType: 'expense' | 'income' | 'merchant';
  /** Entity ID (for expense/income) */
  entityId?: string;
  /** Merchant name (for navigation) */
  merchantName?: string;
  /** Max number to show (default: 3) */
  limit?: number;
}

export function TransactionHistory({
  entityType,
  entityId,
  merchantName,
  limit = 3,
}: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const pathname = usePathname();
  const fromSection = pathname?.split('/')[1] || 'activity';

  useEffect(() => {
    async function fetchTransactions() {
      try {
        const supabase = (await import("@/utils/supabase/client")).createClient();

        if (entityType === 'expense' && entityId) {
          // Fetch expense_matches
          const { data, error } = await supabase
            .from('expense_matches')
            .select(`
              id,
              match_confidence,
              matched_at,
              transactions!inner (
                id,
                up_transaction_id,
                description,
                amount_cents,
                created_at,
                status
              )
            `)
            .eq('expense_definition_id', entityId)
            .order('matched_at', { ascending: false })
            .limit(limit);

          if (!error && data) {
            setTransactions(data.map(m => m.transactions));
            setTotalCount(data.length);
          }
        } else if (entityType === 'income' && entityId) {
          // Fetch income transactions
          const { data: incomeSource } = await supabase
            .from('income_sources')
            .select('linked_up_transaction_id, match_pattern')
            .eq('id', entityId)
            .single();

          if (incomeSource?.linked_up_transaction_id) {
            // Get source transaction
            const { data: sourceTxn } = await supabase
              .from('transactions')
              .select('description')
              .eq('up_transaction_id', incomeSource.linked_up_transaction_id)
              .single();

            if (sourceTxn) {
              // Find all transactions with same description
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: accounts } = await supabase
                  .from('accounts')
                  .select('id')
                  .eq('user_id', user.id);

                const accountIds = accounts?.map(a => a.id) || [];

                const { data } = await supabase
                  .from('transactions')
                  .select('*')
                  .in('account_id', accountIds)
                  .eq('description', sourceTxn.description)
                  .eq('is_income', true)
                  .order('created_at', { ascending: false })
                  .limit(limit);

                setTransactions(data || []);
                setTotalCount(data?.length || 0);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch transaction history:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();
  }, [entityType, entityId, limit]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
    }).format(Math.abs(cents) / 100);
  };

  if (loading) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
          Payment History
        </p>
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
            Loading history...
          </span>
        </div>
      </div>
    );
  }

  // Always show the section, even if no matches
  const hasTransactions = transactions.length > 0;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
        {hasTransactions ? `${totalCount} payment${totalCount !== 1 ? 's' : ''} matched` : 'No payments matched yet'}
      </p>

      {/* Show first few transactions if any exist */}
      {hasTransactions && (
        <div className="space-y-1.5">
          {transactions.slice(0, limit).map((txn: any) => (
            <div
              key={txn.id}
              className="flex items-center justify-between gap-2 p-2 rounded-lg text-xs"
              style={{ backgroundColor: 'var(--muted)' }}
            >
              <span className="font-[family-name:var(--font-dm-sans)] truncate" style={{ color: 'var(--text-secondary)' }}>
                {format(new Date(txn.created_at), 'MMM d, yyyy')}
              </span>
              <span className="font-[family-name:var(--font-dm-sans)] font-bold" style={{ color: 'var(--text-primary)' }}>
                {formatCurrency(txn.amount_cents)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* View All Button - Only show if we have a merchant name */}
      {merchantName && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const router = (window as any).__next_router__;
            if (router) {
              router.push(`/activity/merchant/${encodeURIComponent(merchantName)}?from=${fromSection}`);
            } else {
              window.location.href = `/activity/merchant/${encodeURIComponent(merchantName)}?from=${fromSection}`;
            }
          }}
          className="w-full h-9 rounded-xl font-[family-name:var(--font-dm-sans)] text-xs"
        >
          <History className="h-3 w-3 mr-2" />
          View Transaction History
        </Button>
      )}
    </div>
  );
}
