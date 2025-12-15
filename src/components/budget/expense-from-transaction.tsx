"use client";

/**
 * Expense From Transaction Component
 * COPIES Activity page search implementation EXACTLY
 * Adds: Click transaction → find ALL related → create expense
 */

import { useState, useEffect, useRef } from "react";
import { goeyToast as toast } from "goey-toast";
import { TransactionCard } from "@/components/activity/transaction-card";
import { CategoryProvider } from "@/contexts/category-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Loader2, Check, ArrowLeft, DollarSign, Calendar, ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { suggestMatchPattern, suggestExpenseCategory, suggestExpenseEmoji, detectRecurrenceFromGaps, checkAmountConsistency, checkTimingConsistency, predictNextDate } from "@/lib/expense-matcher";
import { createClient } from "@/utils/supabase/client";
import { createExpenseFromTransaction } from "@/app/actions/expenses";

/**
 * Format ISO date string for HTML date input
 * Converts "2025-12-24T00:00:00.000Z" to "2025-12-24"
 */
function formatDateForInput(isoString: string): string {
  if (!isoString) return '';
  return isoString.split('T')[0];
}

/**
 * Get modern category name from Up Bank transaction category_id
 */
function getCategoryFromTransaction(txn: any, mappings: any[]): string {
  if (txn.category_id && mappings.length > 0) {
    const mapping = mappings.find((m: any) => m.upCategoryId === txn.category_id);
    if (mapping) return mapping.newParentName;
  }
  return suggestExpenseCategory(txn.description);
}

interface ExpenseFromTransactionProps {
  partnershipId?: string;
  onSuccess?: () => void;
  /** Pre-select a transaction, skipping the search step */
  initialTransaction?: any;
  /** Called when user clicks "back" in pre-selected mode */
  onBack?: () => void;
}

export function ExpenseFromTransaction({ onSuccess, initialTransaction, onBack }: ExpenseFromTransactionProps) {
  // COPY from Activity page - search state
  const [searchTerm, setSearchTerm] = useState("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const isFirstRender = useRef(true);
  const hasAutoSelected = useRef(false);

  // Pattern detection state
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [relatedTransactions, setRelatedTransactions] = useState<any[]>([]);
  const [detectedPattern, setDetectedPattern] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields for detected pattern (user can override auto-detected values)
  const [editedName, setEditedName] = useState("");
  const [editedAmount, setEditedAmount] = useState("");
  const [editedRecurrence, setEditedRecurrence] = useState("");
  const [editedNextDate, setEditedNextDate] = useState("");
  const [editedCategory, setEditedCategory] = useState("");

  // Category mappings for TransactionCard
  const [categoryMappings, setCategoryMappings] = useState<any[]>([]);

  // Initialize editable fields when pattern is detected
  useEffect(() => {
    if (detectedPattern) {
      setEditedName(detectedPattern.merchantName);
      setEditedAmount((detectedPattern.avgAmountCents / 100).toFixed(2));
      setEditedRecurrence(detectedPattern.recurrenceType);
      setEditedNextDate(formatDateForInput(detectedPattern.nextPredictedDate)); // Fix: format for date input
      setEditedCategory(detectedPattern.categoryName);
    }
  }, [detectedPattern]);

  // Load category mappings
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

  // Auto-select initial transaction when provided (skip search)
  useEffect(() => {
    if (initialTransaction && categoryMappings.length > 0 && !hasAutoSelected.current) {
      hasAutoSelected.current = true;
      handleSelectTransaction(initialTransaction);
    }
  }, [initialTransaction, categoryMappings]);

  // Only load transactions when user searches
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Don't load transactions unless there's a search term
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

        const response = await fetch(`/api/transactions?${params.toString()}`);
        const data = await response.json();

        setTransactions(data.transactions || []);
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setLoading(false);
      }
    };

    refetchTransactions();
  }, [searchTerm]);

  // Handle transaction selection - find ALL related
  const handleSelectTransaction = async (txn: any) => {
    setSelectedTransaction(txn);

    const supabase = createClient();

    // Get pattern like "NETFLIX%"
    const pattern = suggestMatchPattern(txn.description);

    // Find ALL matching transactions
    const { data: allMatching } = await supabase
      .from("transactions")
      .select("id, description, amount_cents, created_at, settled_at, category_id, parent_category_id, account_id")
      .ilike("description", `${pattern.replace(/%/g, '')}%`)
      .order("created_at", { ascending: true });

    setRelatedTransactions(allMatching || [txn]);

    // Analyze pattern
    // Use SELECTED transaction amount, not average (user chose this specific transaction)
    const selectedAmount = Math.abs(txn.amount_cents);

    const recurrence = detectRecurrenceFromGaps(allMatching || [txn]);
    const nextDate = predictNextDate(
      (allMatching?.[allMatching.length - 1] || txn).created_at,
      recurrence
    );
    const amountConsistency = checkAmountConsistency(allMatching || [txn]);
    const timingConsistency = checkTimingConsistency(allMatching || [txn]);

    let confidence = 0.2;
    if (amountConsistency) confidence += 0.4;
    else confidence += 0.2;
    if (timingConsistency) confidence += 0.4;
    else if (recurrence !== 'irregular' && recurrence !== 'one-time') confidence += 0.2;

    setDetectedPattern({
      merchantPattern: pattern,
      merchantName: txn.description, // Use full description, don't truncate
      recurrenceType: recurrence,
      avgAmountCents: selectedAmount, // Use selected transaction amount
      nextPredictedDate: nextDate,
      confidence: Math.min(confidence, 1.0),
      transactionCount: allMatching?.length || 1,
      categoryName: getCategoryFromTransaction(txn, categoryMappings) // Fix: use Up Bank category
    });
  };

  // Handle confirmation - uses EDITED values (user can override auto-detected)
  const handleConfirm = async () => {
    if (!detectedPattern || !selectedTransaction) return;

    setSaving(true);

    try {
      // Use NEW createExpenseFromTransaction function
      const amountCents = Math.round(parseFloat(editedAmount) * 100);

      const result = await createExpenseFromTransaction(
        selectedTransaction.id,
        {
          customName: editedName,
          category: editedCategory,
          recurrence: editedRecurrence,
          expectedAmountCents: amountCents,
          nextDueDate: editedNextDate,
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create expense');
      }

      toast.success("Expense created successfully!");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Failed to create expense:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Failed to create expense'}`);
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

  const getConfidenceLevel = (conf: number) => conf >= 0.8 ? "high" : conf >= 0.5 ? "medium" : "low";

  return (
    <div className="space-y-6">
      {/* Loading state for pre-selected transaction */}
      {initialTransaction && !selectedTransaction && (
        <div className="py-12 text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: 'var(--pastel-blue)' }} />
          <p className="mt-3 font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-secondary)' }}>
            Analyzing transaction pattern...
          </p>
        </div>
      )}

      {/* Search Section */}
      {!selectedTransaction && !initialTransaction && (
        <div className="space-y-4">
          <div>
            <h3 className="font-[family-name:var(--font-nunito)] text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Find Recurring Expense
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-secondary)' }}>
              Search for expenses like Netflix, gym, rent, etc.
            </p>
          </div>
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
              <Input
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 h-12 rounded-xl border-2 font-[family-name:var(--font-dm-sans)]"
                style={{
                  borderColor: searchTerm ? 'var(--pastel-blue)' : 'var(--border)',
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--muted)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </button>
              )}
            </div>

            {/* Results */}
            {loading ? (
              <div className="py-12 text-center">
                <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: 'var(--pastel-blue)' }} />
              </div>
            ) : transactions.length > 0 ? (
              <CategoryProvider mappings={categoryMappings}>
                <div className="divide-y max-h-[280px] overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                  {transactions.map((transaction, index) => (
                    <div
                      key={transaction.id}
                      className="transition-all cursor-pointer"
                      style={{
                        backgroundColor: 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--pastel-blue-light)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
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
                <Search className="w-12 h-12 mx-auto mb-3 opacity-40" style={{ color: 'var(--text-tertiary)' }} />
                <p className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: 'var(--text-primary)' }}>No transactions found</p>
              </div>
            ) : null}
        </div>
      )}

      {/* Pattern Detection View */}
      {selectedTransaction && detectedPattern && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Back button */}
          {!initialTransaction && (
            <button
              onClick={() => {
                setSelectedTransaction(null);
                setDetectedPattern(null);
              }}
              className="flex items-center gap-1.5 font-[family-name:var(--font-dm-sans)] text-sm transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to search
            </button>
          )}

          {/* Compact Pattern Info Header */}
          <div
            className="p-3 rounded-xl border-2 flex items-center justify-between"
            style={{
              borderColor: "var(--pastel-mint)",
              backgroundColor: "var(--pastel-mint-light)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{ backgroundColor: "var(--card)" }}
              >
                💰
              </div>
              <div>
                <p
                  className="font-[family-name:var(--font-nunito)] font-bold text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {detectedPattern.transactionCount} matches found
                </p>
                <p
                  className="font-[family-name:var(--font-dm-sans)] text-xs"
                  style={{ color: "var(--pastel-mint-dark)" }}
                >
                  {getConfidenceLevel(detectedPattern.confidence) === 'high' ? 'High confidence pattern' :
                   getConfidenceLevel(detectedPattern.confidence) === 'medium' ? 'Medium confidence' : 'Low confidence'}
                </p>
              </div>
            </div>
            <Badge
              className="font-[family-name:var(--font-nunito)] font-bold text-[10px]"
              style={{
                backgroundColor: getConfidenceLevel(detectedPattern.confidence) === 'high' ? 'var(--pastel-mint)' :
                                 getConfidenceLevel(detectedPattern.confidence) === 'medium' ? 'var(--pastel-yellow)' : 'var(--pastel-coral)',
                color: 'white'
              }}
            >
              {getConfidenceLevel(detectedPattern.confidence).toUpperCase()}
            </Badge>
          </div>

          {/* Editable Form Fields */}
          <div className="space-y-3">
            {/* Name */}
            <div>
              <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
                Expense Name
              </Label>
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="h-11 rounded-xl font-[family-name:var(--font-dm-sans)]"
              />
            </div>

            {/* Amount + Recurrence */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
                  Amount
                </Label>
                <div className="relative">
                  <DollarSign
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={editedAmount}
                    onChange={(e) => setEditedAmount(e.target.value)}
                    className="h-11 rounded-xl pl-9 font-[family-name:var(--font-dm-sans)]"
                  />
                </div>
              </div>
              <div>
                <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
                  Recurrence
                </Label>
                <Select value={editedRecurrence} onValueChange={setEditedRecurrence}>
                  <SelectTrigger className="h-11 rounded-xl font-[family-name:var(--font-dm-sans)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                    <SelectItem value="irregular">Irregular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Next Due + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
                  Next Due
                </Label>
                <div className="relative">
                  <Calendar
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <Input
                    type="date"
                    value={editedNextDate}
                    onChange={(e) => setEditedNextDate(e.target.value)}
                    className="h-11 rounded-xl pl-9 font-[family-name:var(--font-dm-sans)]"
                  />
                </div>
              </div>
              <div>
                <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
                  Category
                </Label>
                <Input
                  value={editedCategory}
                  onChange={(e) => setEditedCategory(e.target.value)}
                  className="h-11 rounded-xl font-[family-name:var(--font-dm-sans)]"
                />
              </div>
            </div>
          </div>

          {/* Transaction History - Collapsible */}
          <details className="group">
            <summary
              className="flex items-center justify-between p-3 rounded-xl cursor-pointer list-none"
              style={{ backgroundColor: "var(--muted)" }}
            >
              <span
                className="font-[family-name:var(--font-nunito)] font-bold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                Transaction History ({relatedTransactions.length})
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" style={{ color: "var(--text-secondary)" }} />
            </summary>
            <div className="mt-2 space-y-1 max-h-[150px] overflow-y-auto">
              {relatedTransactions.map((txn) => (
                <div
                  key={txn.id}
                  className="flex justify-between items-center p-2 px-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: txn.id === selectedTransaction.id ? 'var(--pastel-blue-light)' : 'transparent',
                  }}
                >
                  <span className="font-[family-name:var(--font-dm-sans)]" style={{ color: "var(--text-secondary)" }}>
                    {formatDate(txn.created_at)}
                  </span>
                  <span className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>
                    {formatCurrency(txn.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          </details>

          {/* Create Button */}
          <Button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full h-12 font-[family-name:var(--font-nunito)] font-bold text-base rounded-xl"
            style={{ backgroundColor: 'var(--pastel-blue)', color: 'white' }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Create Expense
              </>
            )}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
