"use client";

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { TransactionCard } from "@/components/activity/transaction-card";
import { CategoryProvider } from "@/contexts/category-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, X, Loader2 } from "lucide-react";
import { suggestMatchPattern } from "@/lib/expense-matcher";
import { analyzeIncomePattern } from "@/lib/income-pattern-analysis";
import { createClient } from "@/utils/supabase/client";
import { createIncomeSourceFromTransaction } from "@/app/actions/income";

export interface IncomeFromTransactionHandle {
  resetToSearch: () => void;
}

interface NewIncomeData {
  id: string;
  name: string;
  amount_cents: number;
  frequency?: string;
}

interface IncomeFromTransactionProps {
  userId: string;
  accountIds: string[];
  partnershipId?: string;
  onSuccess?: (newIncome?: NewIncomeData) => void;
  onViewChange?: (view: "search" | "confirmation") => void;
  onBackFromSearch?: () => void;  // Called when user presses back from search view
}

export const IncomeFromTransaction = forwardRef<IncomeFromTransactionHandle, IncomeFromTransactionProps>(
  function IncomeFromTransaction({
    userId,
    accountIds,
    partnershipId,
    onSuccess,
    onViewChange,
    onBackFromSearch,
  }, ref) {
  const [searchTerm, setSearchTerm] = useState("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const isFirstRender = useRef(true);
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [relatedTransactions, setRelatedTransactions] = useState<any[]>([]);
  const [detectedPattern, setDetectedPattern] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryMappings, setCategoryMappings] = useState<any[]>([]);

  const handleBackToSearch = () => {
    setSelectedTransaction(null);
    setDetectedPattern(null);
    setRelatedTransactions([]);
  };

  // Expose resetToSearch method via ref
  useImperativeHandle(ref, () => ({
    resetToSearch: handleBackToSearch,
  }));

  // Notify parent of view changes
  useEffect(() => {
    onViewChange?.(selectedTransaction ? "confirmation" : "search");
  }, [selectedTransaction, onViewChange]);

  useEffect(() => {
    const loadMappings = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("category_mappings")
        .select("up_category_id, new_parent_name, new_child_name, icon, display_order")
        .order("display_order");

      const mappings = data?.map(m => ({
        upCategoryId: m.up_category_id,
        newParentName: m.new_parent_name,
        newChildName: m.new_child_name,
        icon: m.icon,
        displayOrder: m.display_order
      })) || [];

      setCategoryMappings(mappings);
    };

    loadMappings();
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!searchTerm) {
      setTransactions([]);
      return;
    }

    const refetchTransactions = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          offset: "0",
          limit: "50",
        });

        if (searchTerm) params.set("search", searchTerm);
        if (accountIds.length > 0) params.set("accountId", accountIds.join(','));

        const response = await fetch(`/api/transactions?${params.toString()}`);
        const data = await response.json();

        const incomeTransactions = (data.transactions || []).filter((t: any) => t.amount_cents > 0);
        setTransactions(incomeTransactions);
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setLoading(false);
      }
    };

    refetchTransactions();
  }, [searchTerm, accountIds]);

  const handleSelectTransaction = async (txn: any) => {
    setSelectedTransaction(txn);

    const supabase = createClient();
    const pattern = suggestMatchPattern(txn.description);

    const { data: allMatching } = await supabase
      .from("transactions")
      .select("*")
      .in("account_id", accountIds)
      .ilike("description", `${pattern.replace(/%/g, '')}%`)
      .gt("amount_cents", 0)
      .order("created_at", { ascending: true });

    setRelatedTransactions(allMatching || [txn]);

    const incomePattern = analyzeIncomePattern(allMatching || [txn]);

    setDetectedPattern({
      merchantPattern: pattern,
      merchantName: txn.description,
      recurrenceType: incomePattern.frequency,
      avgAmountCents: Math.abs(txn.amount_cents),
      nextPredictedDate: incomePattern.nextPredictedPayDate || new Date().toISOString(),
      confidence: incomePattern.confidence === "high" ? 0.9 : incomePattern.confidence === "medium" ? 0.7 : 0.5,
      transactionCount: allMatching?.length || 1,
      categoryName: "Income"
    });
  };

  const handleConfirm = async () => {
    if (!detectedPattern || !selectedTransaction) return;

    setSaving(true);

    try {
      const result = await createIncomeSourceFromTransaction(
        selectedTransaction.id,
        'recurring',
        {
          customName: detectedPattern.merchantName,
        }
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      if (onSuccess) {
        // Pass back the new income data for local state updates
        const newIncomeData: NewIncomeData = {
          id: result.incomeSource?.id || '',
          name: detectedPattern.merchantName,
          amount_cents: Math.abs(detectedPattern.avgAmountCents || 0),
          frequency: detectedPattern.recurrenceType,
        };
        onSuccess(newIncomeData);
      }
    } catch (error) {
      console.error("Failed to set income:", error);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(cents) / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
  };

  // Search view
  if (!selectedTransaction) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search" className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
            Search for your paycheck
          </Label>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Search for your salary or income transactions
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-secondary" />
            <Input
              id="search"
              placeholder="Search for 'salary', employer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4 text-text-secondary" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-coral" />
          </div>
        ) : transactions.length > 0 ? (
          <CategoryProvider mappings={categoryMappings}>
            <div className="border-2 border-border rounded-xl divide-y divide-border max-h-[400px] overflow-y-auto">
              {transactions.map((transaction, index) => (
                <div
                  key={transaction.id}
                  className="hover:bg-secondary transition-all cursor-pointer"
                  onClick={() => handleSelectTransaction(transaction)}
                >
                  <TransactionCard
                    transaction={transaction}
                    index={index}
                    onClick={() => handleSelectTransaction(transaction)}
                    showCategory={true}
                  />
                </div>
              ))}
            </div>
          </CategoryProvider>
        ) : searchTerm ? (
          <div className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-20 text-text-secondary" />
            <p className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">No income transactions found</p>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm mt-2 text-text-secondary">Try searching for "salary" or your employer name</p>
          </div>
        ) : null}
      </div>
    );
  }

  // Confirmation view - Back button handled by parent wizard
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-1">
            {detectedPattern?.merchantName}
          </h3>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Found {detectedPattern?.transactionCount} matching income transactions
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border-2 border-border bg-secondary">
          <div>
            <Label className="text-xs text-text-secondary">Average Amount</Label>
            <p className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary">
              {formatCurrency(detectedPattern?.avgAmountCents || 0)}
            </p>
          </div>
          <div>
            <Label className="text-xs text-text-secondary">Frequency</Label>
            <p className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary capitalize">
              {detectedPattern?.recurrenceType}
            </p>
          </div>
          <div>
            <Label className="text-xs text-text-secondary">Next Pay</Label>
            <p className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary">
              {formatDate(detectedPattern?.nextPredictedDate || new Date().toISOString())}
            </p>
          </div>
          <div>
            <Label className="text-xs text-text-secondary">Transactions</Label>
            <p className="font-[family-name:var(--font-nunito)] text-base font-bold text-text-primary">
              {detectedPattern?.transactionCount}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
            Recent Payments ({relatedTransactions.length})
          </Label>
          <div className="border-2 border-border rounded-xl divide-y divide-border max-h-[200px] overflow-y-auto">
            {relatedTransactions.map((txn) => (
              <div
                key={txn.id}
                className="flex justify-between items-center p-3 hover:bg-secondary transition-colors"
              >
                <span className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                  {formatDate(txn.created_at)}
                </span>
                <span className="font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                  {formatCurrency(txn.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold bg-brand-coral hover:bg-brand-coral-dark hover:scale-105 transition-all"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Set as Income Source'
          )}
        </Button>
      </div>
    </div>
  );
});
