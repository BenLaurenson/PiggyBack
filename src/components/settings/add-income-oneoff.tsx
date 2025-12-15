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

interface IncomeSourceForEdit {
  id: string;
  name: string;
  source_type: 'recurring-salary' | 'one-off';
  one_off_type?: string;
  amount_cents: number;
  expected_date?: string;
  received_date?: string;
  is_received?: boolean;
  notes?: string;
}

interface AddIncomeOneOffProps {
  userId: string;
  partnershipId?: string;
  existingSource?: IncomeSourceForEdit | null;
  isManualPartnerIncome?: boolean;
  onSuccess?: () => void;
}

const ONE_OFF_TYPES = [
  { value: 'bonus', label: 'Bonus' },
  { value: 'gift', label: 'Gift' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'tax-refund', label: 'Tax Refund' },
  { value: 'freelance', label: 'Freelance Project' },
  { value: 'other', label: 'Other' },
];

export function AddIncomeOneOff({ userId, partnershipId, existingSource, isManualPartnerIncome, onSuccess }: AddIncomeOneOffProps) {
  const [oneOffType, setOneOffType] = useState<string>(existingSource?.one_off_type || "bonus");
  const [name, setName] = useState(existingSource?.name || "");
  const [amount, setAmount] = useState(existingSource?.amount_cents ? (existingSource.amount_cents / 100).toFixed(2) : "");
  const [expectedDate, setExpectedDate] = useState(existingSource?.expected_date || "");
  const [alreadyReceived, setAlreadyReceived] = useState(existingSource?.is_received || false);
  const [notes, setNotes] = useState(existingSource?.notes || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOneOffType(existingSource?.one_off_type || "bonus");
    setName(existingSource?.name || "");
    setAmount(existingSource?.amount_cents ? (existingSource.amount_cents / 100).toFixed(2) : "");
    setExpectedDate(existingSource?.expected_date || "");
    setAlreadyReceived(existingSource?.is_received || false);
    setNotes(existingSource?.notes || "");
  }, [existingSource]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amountCents = Math.round(parseFloat(amount) * 100);
      const now = new Date().toISOString();

      let result;

      if (existingSource?.id) {
        result = await updateIncomeSource(existingSource.id, {
          name,
          one_off_type: oneOffType as any,
          amount_cents: amountCents,
          expected_date: expectedDate,
          is_received: alreadyReceived,
          received_date: alreadyReceived ? now : undefined,
          notes: notes || undefined,
        });
      } else {
        result = await createIncomeSource({
          user_id: userId,
          partnership_id: partnershipId,
          name,
          source_type: 'one-off',
          one_off_type: oneOffType as any,
          amount_cents: amountCents,
          expected_date: expectedDate,
          is_received: alreadyReceived,
          received_date: alreadyReceived ? now : undefined,
          notes: notes || undefined,
          is_active: true,
          is_manual_partner_income: isManualPartnerIncome || false,
        });
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Save error:", err);
      setError(existingSource ? "Failed to update one-off income" : "Failed to save one-off income");
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

      <div className="space-y-2">
        <Label htmlFor="type" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Income Type
        </Label>
        <Select value={oneOffType} onValueChange={setOneOffType} required disabled={loading}>
          <SelectTrigger className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ONE_OFF_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Name
        </Label>
        <Input
          id="name"
          placeholder="e.g., Christmas Bonus, Tax Refund 2025"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={loading}
          className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Amount
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
        <Label htmlFor="expectedDate" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Expected Date
        </Label>
        <Input
          id="expectedDate"
          type="date"
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          required
          disabled={loading}
          className="h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
        />
      </div>

      <div className="flex items-center space-x-2 p-4 rounded-xl border-2 border-border bg-secondary">
        <input
          type="checkbox"
          id="alreadyReceived"
          checked={alreadyReceived}
          onChange={(e) => setAlreadyReceived(e.target.checked)}
          className="w-5 h-5 rounded cursor-pointer"
        />
        <Label
          htmlFor="alreadyReceived"
          className="font-[family-name:var(--font-dm-sans)] text-sm cursor-pointer text-text-primary"
        >
          I've already received this income
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
          Notes (Optional)
        </Label>
        <Textarea
          id="notes"
          placeholder="Add any notes about this income..."
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
            {existingSource ? 'Update One-off Income' : 'Save One-off Income'}
          </>
        )}
      </Button>
    </form>
  );
}
