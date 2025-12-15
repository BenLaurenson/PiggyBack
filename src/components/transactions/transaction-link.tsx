"use client";

/**
 * Transaction Link Component
 * Reusable component for displaying a linked Up Bank transaction
 * Used across: expense editing, income editing, goal details, etc.
 *
 * Styled to match form inputs - simple, inline, no separate cards
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface TransactionLinkProps {
  upTransactionId: string;
  label?: string;
  compact?: boolean;
}

export function TransactionLink({
  upTransactionId,
  label = "Created from transaction:",
  compact = false,
}: TransactionLinkProps) {
  const [transaction, setTransaction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchTransaction() {
      try {
        const supabase = (await import("@/utils/supabase/client")).createClient();
        const { data, error } = await supabase
          .from('transactions')
          .select('id, up_transaction_id, description, amount_cents, created_at, status')
          .eq('up_transaction_id', upTransactionId)
          .maybeSingle();

        if (error || !data) {
          setError(true);
        } else {
          setTransaction(data);
        }
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchTransaction();
  }, [upTransactionId]);

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
          {label}
        </p>
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
            Loading transaction...
          </span>
        </div>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
          {label}
        </p>
        <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--muted)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
            Transaction not available
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </p>
      <div
        className="flex items-center justify-between gap-3 p-3 rounded-xl border"
        style={{
          backgroundColor: 'var(--muted)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-primary)' }}>
            {transaction.description}
          </p>
          <p className="text-xs font-[family-name:var(--font-dm-sans)]" style={{ color: 'var(--text-secondary)' }}>
            {format(new Date(transaction.created_at), 'MMM d, yyyy')} • {formatCurrency(transaction.amount_cents)}
          </p>
        </div>
      </div>
    </div>
  );
}
