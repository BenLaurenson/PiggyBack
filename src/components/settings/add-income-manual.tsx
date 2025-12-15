"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, DollarSign, Calendar } from "lucide-react";
import { createIncomeSource, updateIncomeSource, type IncomeSource } from "@/app/actions/income-sources";
import { TransactionLink } from "@/components/transactions/transaction-link";
import { TransactionHistory } from "@/components/transactions/transaction-history";

interface IncomeSourceForEdit {
  id: string;
  name: string;
  source_type: 'recurring-salary' | 'one-off';
  amount_cents: number;
  frequency?: string;
  last_pay_date?: string;
  next_pay_date?: string;
  notes?: string;
  linked_up_transaction_id?: string;
}

interface NewIncomeData {
  id: string;
  name: string;
  amount_cents: number;
  frequency?: string;
}

interface AddIncomeManualProps {
  userId: string;
  partnershipId?: string;
  existingSource?: IncomeSourceForEdit | null;
  isManualPartnerIncome?: boolean;
  onSuccess?: (newIncome?: NewIncomeData) => void;
}

export function AddIncomeManual({ userId, partnershipId, existingSource, isManualPartnerIncome, onSuccess }: AddIncomeManualProps) {
  const [name, setName] = useState(existingSource?.name || "");
  const [amount, setAmount] = useState(existingSource?.amount_cents ? (existingSource.amount_cents / 100).toFixed(2) : "");
  const [frequency, setFrequency] = useState<string>(existingSource?.frequency || "monthly");
  const [lastPayDate, setLastPayDate] = useState(existingSource?.last_pay_date || "");
  const [nextPayDate, setNextPayDate] = useState(existingSource?.next_pay_date || "");
  const [notes, setNotes] = useState(existingSource?.notes || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(existingSource?.name || "");
    setAmount(existingSource?.amount_cents ? (existingSource.amount_cents / 100).toFixed(2) : "");
    setFrequency(existingSource?.frequency || "monthly");
    setLastPayDate(existingSource?.last_pay_date || "");
    setNextPayDate(existingSource?.next_pay_date || "");
    setNotes(existingSource?.notes || "");
  }, [existingSource]);

  useEffect(() => {
    if (!lastPayDate || !frequency) return;

    const last = new Date(lastPayDate);
    const next = new Date(last);

    switch (frequency) {
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'fortnightly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'quarterly':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1);
        break;
    }

    setNextPayDate(next.toISOString().split('T')[0]);
  }, [lastPayDate, frequency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amountCents = Math.round(parseFloat(amount) * 100);

      let result;

      if (existingSource?.id) {
        result = await updateIncomeSource(existingSource.id, {
          name,
          amount_cents: amountCents,
          frequency: frequency as any,
          last_pay_date: lastPayDate,
          next_pay_date: nextPayDate,
          notes: notes || undefined,
        });
      } else {
        result = await createIncomeSource({
          user_id: userId,
          partnership_id: partnershipId,
          name,
          source_type: 'recurring-salary',
          amount_cents: amountCents,
          frequency: frequency as any,
          last_pay_date: lastPayDate,
          next_pay_date: nextPayDate,
          notes: notes || undefined,
          is_active: true,
          is_manual_partner_income: isManualPartnerIncome || false,
        });
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      if (onSuccess) {
        // Pass back the new income data for local state updates
        const newIncomeData: NewIncomeData = {
          id: result.data?.id || '',
          name,
          amount_cents: amountCents,
          frequency: frequency as string,
        };
        onSuccess(newIncomeData);
      }
    } catch (err) {
      console.error("Save error:", err);
      setError(existingSource ? "Failed to update income source" : "Failed to save income source");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 text-sm bg-error-light border-2 border-error-border rounded-xl text-error-text">
          {error}
        </div>
      )}

      {existingSource?.linked_up_transaction_id && (
        <TransactionLink
          upTransactionId={existingSource.linked_up_transaction_id}
          label="Created from transaction:"
        />
      )}

      {existingSource?.id && (
        <TransactionHistory
          entityType="income"
          entityId={existingSource.id}
          merchantName={existingSource.name}
          limit={3}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="name" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Income Source Name
        </Label>
        <Input
          id="name"
          placeholder="e.g., Main Salary, Freelance Work"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={loading}
          className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Amount per Pay Period
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            disabled={loading}
            className="pl-7 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="frequency" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Payment Frequency
        </Label>
        <Select value={frequency} onValueChange={setFrequency} required disabled={loading}>
          <SelectTrigger className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="fortnightly">Fortnightly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="lastPayDate" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
            Last Pay Date
          </Label>
          <Input
            id="lastPayDate"
            type="date"
            value={lastPayDate}
            onChange={(e) => setLastPayDate(e.target.value)}
            required
            disabled={loading}
            className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nextPayDate" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
            Next Pay Date
          </Label>
          <Input
            id="nextPayDate"
            type="date"
            value={nextPayDate}
            onChange={(e) => setNextPayDate(e.target.value)}
            required
            disabled={loading}
            className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
          />
          <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-secondary">
            Auto-calculated from last pay + frequency
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Notes (Optional)
        </Label>
        <Textarea
          id="notes"
          placeholder="Add any notes about this income source..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
          className="rounded-xl border-2 font-[family-name:var(--font-dm-sans)] min-h-[80px]"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            {existingSource ? 'Updating...' : 'Saving...'}
          </>
        ) : (
          <>
            <Save className="w-5 h-5 mr-2" />
            {existingSource ? 'Update Income Source' : 'Save Income Source'}
          </>
        )}
      </Button>
    </form>
  );
}
