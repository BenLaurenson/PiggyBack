"use client";

/**
 * Expense Definition Modal - Redesigned for compact UI
 * Features: Shared expense toggle, improved emoji picker, unified actions
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Save,
  DollarSign,
  Calendar,
  Trash2,
  Users,
  User,
  ChevronDown,
  Link2,
  ExternalLink,
  RefreshCw,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ExpenseFromTransaction } from "./expense-from-transaction";
import { motion, AnimatePresence } from "framer-motion";
import { EmojiPicker as EmojiPickerLib } from "@ferrucc-io/emoji-picker";

interface ExpenseDefinitionModalProps {
  open: boolean;
  onClose: () => void;
  partnershipId: string;
  categories: string[];
  expense?: any;
  initialSplit?: { isShared: boolean; splitPercentage: number } | null;
}

const SPLIT_PRESETS = [
  { label: "50/50", value: 50 },
  { label: "60/40", value: 60 },
  { label: "70/30", value: 70 },
];

export function ExpenseDefinitionModal({
  open,
  onClose,
  partnershipId,
  categories,
  expense,
  initialSplit,
}: ExpenseDefinitionModalProps) {
  const router = useRouter();
  const isEditing = !!expense;

  // Resolve category: prefer category_name if it matches an option,
  // otherwise fall back to inferred_subcategory (parent→child mismatch).
  const resolveCategory = (exp: any) => {
    if (!exp) return "";
    if (exp.category_name && categories.includes(exp.category_name)) return exp.category_name;
    if (exp.inferred_subcategory && categories.includes(exp.inferred_subcategory)) return exp.inferred_subcategory;
    return exp.category_name || "";
  };

  // Form state
  const [name, setName] = useState(expense?.name || "");
  const [category, setCategory] = useState(resolveCategory(expense));
  const [amount, setAmount] = useState(
    expense?.expected_amount_cents
      ? (expense.expected_amount_cents / 100).toFixed(2)
      : ""
  );
  const [recurrence, setRecurrence] = useState(expense?.recurrence_type || "monthly");
  const [dueDate, setDueDate] = useState(expense?.next_due_date || "");
  const [emoji, setEmoji] = useState(expense?.emoji || "💰");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Shared expense state — initialized from pre-loaded context data (no fetch needed)
  const [isShared, setIsShared] = useState(initialSplit?.isShared ?? false);
  const [splitPercentage, setSplitPercentage] = useState(initialSplit?.splitPercentage ?? 50);

  // Linked transaction state
  const [linkedTransaction, setLinkedTransaction] = useState<any>(null);
  const [matchedTransactions, setMatchedTransactions] = useState<any[]>([]);
  const [loadingTransaction, setLoadingTransaction] = useState(false);
  const [showTransactionPicker, setShowTransactionPicker] = useState(false);
  const [availableTransactions, setAvailableTransactions] = useState<any[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [linkingTransaction, setLinkingTransaction] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState("");

  // Tab state for new expense creation
  const [activeTab, setActiveTab] = useState("manual");

  // Use expense_matches data that's already passed from the budget page
  useEffect(() => {
    if (isEditing && expense?.id && open) {
      const expenseWithMatches = expense as any;
      if (expenseWithMatches.expense_matches && expenseWithMatches.expense_matches.length > 0) {
        const transactions = expenseWithMatches.expense_matches
          .map((m: any) => m.transactions)
          .filter((t: any) => t != null)
          .sort((a: any, b: any) => {
            const dateA = new Date(a.settled_at || a.created_at).getTime();
            const dateB = new Date(b.settled_at || b.created_at).getTime();
            return dateB - dateA;
          });
        setMatchedTransactions(transactions);
        if (transactions.length > 0) {
          setLinkedTransaction(transactions[0]);
        }
      } else {
        setMatchedTransactions([]);
        setLinkedTransaction(null);
      }
    }
  }, [expense?.id, open, isEditing]);

  // Reset form when expense changes
  useEffect(() => {
    setName(expense?.name || "");
    setCategory(resolveCategory(expense));
    setAmount(
      expense?.expected_amount_cents
        ? (expense.expected_amount_cents / 100).toFixed(2)
        : ""
    );
    setRecurrence(expense?.recurrence_type || "monthly");
    setDueDate(expense?.next_due_date || "");
    setEmoji(expense?.emoji || "💰");
    setError(null);
    setShowTransactionPicker(false);
    setAvailableTransactions([]);
    setIsShared(initialSplit?.isShared ?? false);
    setSplitPercentage(initialSplit?.splitPercentage ?? 50);
    if (!isEditing) {
      setLinkedTransaction(null);
      setMatchedTransactions([]);
      setActiveTab("manual");
    }
  }, [expense, isEditing, initialSplit]);

  // Load available transactions when picker is shown or search changes
  useEffect(() => {
    if (!showTransactionPicker || !partnershipId) return;

    const loadAvailableTransactions = async () => {
      setLoadingAvailable(true);
      try {
        const searchParam = transactionSearch ? `&search=${encodeURIComponent(transactionSearch)}` : "";
        const res = await fetch(`/api/budget/available-transactions?partnership_id=${partnershipId}${searchParam}`);
        if (res.ok) {
          const data = await res.json();
          const matchedIds = new Set(matchedTransactions.map(t => t.id));
          const expenseTransactions = (data.transactions || [])
            .filter((t: any) => !matchedIds.has(t.id))
            .slice(0, 30);
          setAvailableTransactions(expenseTransactions);
        }
      } catch (err) {
        console.error("Failed to load transactions:", err);
      } finally {
        setLoadingAvailable(false);
      }
    };

    // Debounce search input
    const timer = setTimeout(loadAvailableTransactions, transactionSearch ? 300 : 0);
    return () => clearTimeout(timer);
  }, [showTransactionPicker, partnershipId, matchedTransactions, transactionSearch]);

  // Handle linking a transaction to the expense
  const handleLinkTransaction = async (transactionId: string) => {
    if (!expense?.id || linkingTransaction) return;

    setLinkingTransaction(true);
    try {
      const res = await fetch('/api/budget/expenses/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_id: expense.id,
          transaction_id: transactionId,
          confidence: 1.0, // Manual link = high confidence
        }),
      });

      if (res.ok) {
        // Refresh to get updated matches
        router.refresh();
        setShowTransactionPicker(false);
        // Add to matched transactions list immediately
        const linkedTxn = availableTransactions.find(t => t.id === transactionId);
        if (linkedTxn) {
          setMatchedTransactions(prev => [linkedTxn, ...prev]);
        }
      } else {
        const data = await res.json();
        setError(data.error || "Failed to link transaction");
      }
    } catch (err) {
      console.error("Failed to link transaction:", err);
      setError("Failed to link transaction");
    } finally {
      setLinkingTransaction(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amountCents = Math.round(parseFloat(amount) * 100);

      const payload = {
        partnership_id: partnershipId,
        name,
        category_name: category,
        expected_amount_cents: amountCents,
        recurrence_type: recurrence,
        next_due_date: dueDate,
        emoji,
      };

      const url = isEditing
        ? `/api/budget/expenses/${expense.id}`
        : `/api/budget/expenses`;

      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to save expense");
      }

      const savedExpense = await response.json();
      const expenseId = isEditing ? expense.id : savedExpense.expense?.id;

      // Save split settings if shared
      if (expenseId) {
        await saveSplitSettings(expenseId);
      }

      router.refresh();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save expense. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const saveSplitSettings = async (expenseId: string) => {
    try {
      if (isShared) {
        await fetch("/api/budget/splits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partnership_id: partnershipId,
            expense_definition_id: expenseId,
            split_type: splitPercentage === 50 ? "equal" : "custom",
            owner_percentage: splitPercentage,
          }),
        });
      } else if (isEditing) {
        // Remove split if unchecked while editing
        const res = await fetch(`/api/budget/splits?partnership_id=${partnershipId}`);
        if (res.ok) {
          const { settings } = await res.json();
          const expenseSplit = settings?.find(
            (s: any) => s.expense_definition_id === expense?.id
          );
          if (expenseSplit) {
            await fetch(`/api/budget/splits?id=${expenseSplit.id}`, {
              method: "DELETE",
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to save split settings:", err);
    }
  };

  const handleDelete = async () => {
    if (!expense?.id) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/budget/expenses/${expense.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete expense");
      }

      router.refresh();
      onClose();
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete expense. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleEmojiSelect = (selectedEmoji: string) => {
    setEmoji(selectedEmoji);
    setEmojiOpen(false);
  };

  const EmojiPickerComponent = () => (
    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-12 px-4 rounded-xl border-2 flex items-center gap-2 hover:border-[var(--pastel-blue)] transition-colors"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <span className="text-2xl">{emoji}</span>
          <ChevronDown className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <EmojiPickerLib
          onEmojiSelect={handleEmojiSelect}
          emojisPerRow={8}
          emojiSize={32}
          className="border-0 rounded-xl"
        >
          <EmojiPickerLib.Header className="p-3 pb-2">
            <EmojiPickerLib.Input
              placeholder="Search emoji..."
              autoFocus={true}
              className="h-9 rounded-lg border font-[family-name:var(--font-dm-sans)] text-sm"
            />
          </EmojiPickerLib.Header>
          <EmojiPickerLib.Group>
            <EmojiPickerLib.List
              containerHeight={280}
              hideStickyHeader={false}
            />
          </EmojiPickerLib.Group>
        </EmojiPickerLib>
      </PopoverContent>
    </Popover>
  );

  const ManualEntryForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          className="p-3 rounded-lg border-2"
          style={{
            borderColor: "var(--pastel-coral)",
            backgroundColor: "var(--pastel-coral-light)",
          }}
        >
          <p
            className="font-[family-name:var(--font-dm-sans)] text-sm"
            style={{ color: "var(--pastel-coral-dark)" }}
          >
            {error}
          </p>
        </div>
      )}

      {/* Row 1: Emoji + Name */}
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
            Icon
          </Label>
          <EmojiPickerComponent />
        </div>
        <div className="flex-1">
          <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
            Name
          </Label>
          <Input
            placeholder="e.g., Netflix, Rent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
            className="h-12 rounded-xl font-[family-name:var(--font-dm-sans)]"
          />
        </div>
      </div>

      {/* Row 2: Amount + Category */}
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
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={loading}
              className="h-12 rounded-xl pl-9 font-[family-name:var(--font-dm-sans)]"
            />
          </div>
        </div>
        <div>
          <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
            Category
          </Label>
          <Select value={category} onValueChange={setCategory} required>
            <SelectTrigger className="h-12 rounded-xl font-[family-name:var(--font-dm-sans)]">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Recurrence + Due Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="font-[family-name:var(--font-nunito)] font-bold text-xs mb-1.5 block" style={{ color: "var(--text-primary)" }}>
            Recurrence
          </Label>
          <Select value={recurrence} onValueChange={setRecurrence} required>
            <SelectTrigger className="h-12 rounded-xl font-[family-name:var(--font-dm-sans)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="fortnightly">Fortnightly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="one-time">One-time</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              disabled={loading}
              className="h-12 rounded-xl pl-9 font-[family-name:var(--font-dm-sans)]"
            />
          </div>
        </div>
      </div>

      {/* Linked Transaction Section (only when editing) */}
      {isEditing && (
        <div
          className="p-3 rounded-xl border-2"
          style={{
            borderColor: matchedTransactions.length > 0 ? "var(--pastel-mint)" : "var(--border)",
            backgroundColor: matchedTransactions.length > 0 ? "var(--pastel-mint-light)" : "var(--card)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2
                className="h-4 w-4"
                style={{ color: matchedTransactions.length > 0 ? "var(--pastel-mint-dark)" : "var(--text-secondary)" }}
              />
              <span
                className="font-[family-name:var(--font-nunito)] font-bold text-xs"
                style={{ color: "var(--text-primary)" }}
              >
                Matched Transactions
              </span>
              {matchedTransactions.length > 0 && (
                <span
                  className="font-[family-name:var(--font-dm-sans)] text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--pastel-mint)", color: "var(--pastel-mint-dark)" }}
                >
                  {matchedTransactions.length}
                </span>
              )}
            </div>
            {loadingTransaction ? (
              <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--text-secondary)" }} />
            ) : null}
          </div>

          {matchedTransactions.length > 0 && !showTransactionPicker ? (
            <div className="mt-2 space-y-1.5">
              {matchedTransactions.slice(0, 3).map((txn, index) => (
                <div key={txn.id || index} className="flex items-center justify-between py-1 border-b last:border-b-0" style={{ borderColor: "var(--pastel-mint)" }}>
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-[family-name:var(--font-dm-sans)] text-xs truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {txn.description}
                    </p>
                    <p
                      className="font-[family-name:var(--font-dm-sans)] text-[10px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {new Date(txn.created_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className="font-[family-name:var(--font-dm-sans)] text-xs font-medium flex-shrink-0"
                    style={{ color: "var(--pastel-mint-dark)" }}
                  >
                    {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(txn.amount_cents) / 100)}
                  </span>
                </div>
              ))}
              {matchedTransactions.length > 3 && (
                <p
                  className="font-[family-name:var(--font-dm-sans)] text-[10px] pt-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  +{matchedTransactions.length - 3} more transactions
                </p>
              )}
              {/* Link another transaction button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTransactionPicker(true)}
                className="h-6 px-2 text-xs w-full mt-2"
                style={{ color: "var(--pastel-blue-dark)" }}
              >
                <Link2 className="h-3 w-3 mr-1" />
                Link another transaction
              </Button>
            </div>
          ) : showTransactionPicker ? (
            /* Transaction Picker UI */
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <p
                  className="font-[family-name:var(--font-dm-sans)] text-xs font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Select a transaction to link
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowTransactionPicker(false); setTransactionSearch(""); }}
                  className="h-6 px-2 text-xs"
                >
                  Cancel
                </Button>
              </div>
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: "var(--text-tertiary)" }} />
                <Input
                  type="text"
                  placeholder="Search by description..."
                  value={transactionSearch}
                  onChange={(e) => setTransactionSearch(e.target.value)}
                  className="h-7 pl-7 text-xs font-[family-name:var(--font-dm-sans)]"
                />
              </div>
              {loadingAvailable ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--text-secondary)" }} />
                </div>
              ) : availableTransactions.length === 0 ? (
                <p
                  className="font-[family-name:var(--font-dm-sans)] text-xs text-center py-4"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  No recent transactions found
                </p>
              ) : (
                <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded-lg p-1" style={{ borderColor: "var(--border)" }}>
                  {availableTransactions.map((txn) => (
                    <button
                      key={txn.id}
                      type="button"
                      onClick={() => handleLinkTransaction(txn.id)}
                      disabled={linkingTransaction}
                      className="w-full flex items-center justify-between p-2 rounded-md hover:bg-[var(--muted)] transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-[family-name:var(--font-dm-sans)] text-xs font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {txn.description}
                        </p>
                        <p
                          className="font-[family-name:var(--font-dm-sans)] text-[10px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {new Date(txn.settled_at || txn.created_at).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                      <span
                        className="font-[family-name:var(--font-dm-sans)] text-xs font-semibold flex-shrink-0 ml-2"
                        style={{ color: "var(--pastel-coral-dark)" }}
                      >
                        {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(txn.amount_cents) / 100)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between">
              <p
                className="font-[family-name:var(--font-dm-sans)] text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                No matched transactions
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTransactionPicker(true)}
                className="h-7 px-2 text-xs"
                style={{ color: "var(--pastel-blue-dark)" }}
              >
                <Link2 className="h-3 w-3 mr-1" />
                Link
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Shared Expense Section */}
      <div
        className="p-4 rounded-xl border-2"
        style={{
          borderColor: isShared ? "var(--pastel-blue)" : "var(--border)",
          backgroundColor: isShared ? "var(--pastel-blue-light)" : "var(--card)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users
              className="h-4 w-4"
              style={{ color: isShared ? "var(--pastel-blue-dark)" : "var(--text-secondary)" }}
            />
            <span
              className="font-[family-name:var(--font-nunito)] font-bold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              Shared Expense
            </span>
          </div>
          <Switch checked={isShared} onCheckedChange={setIsShared} />
        </div>

        <AnimatePresence>
          {isShared && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                {/* Split bar visualization */}
                <div className="h-6 rounded-lg overflow-hidden flex mb-2">
                  <div
                    className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
                    style={{
                      width: `${splitPercentage}%`,
                      backgroundColor: "var(--pastel-coral)",
                    }}
                  >
                    {splitPercentage > 25 && (
                      <>
                        <User className="h-3 w-3 mr-0.5" />
                        You {splitPercentage}%
                      </>
                    )}
                  </div>
                  <div
                    className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
                    style={{
                      width: `${100 - splitPercentage}%`,
                      backgroundColor: "var(--pastel-blue)",
                    }}
                  >
                    {100 - splitPercentage > 25 && (
                      <>
                        Partner {100 - splitPercentage}%
                      </>
                    )}
                  </div>
                </div>

                {/* Preset buttons */}
                <div className="flex gap-2 mb-2">
                  {SPLIT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setSplitPercentage(preset.value)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        splitPercentage === preset.value
                          ? "bg-white shadow-sm"
                          : "hover:bg-white/50"
                      }`}
                      style={{ color: "var(--text-primary)" }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Slider */}
                <Slider
                  value={[splitPercentage]}
                  onValueChange={([v]) => setSplitPercentage(v)}
                  min={0}
                  max={100}
                  step={5}
                  className="py-1"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isShared && (
          <p
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            Enable to split this expense with your partner
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={loading || deleting}
            className="h-12 px-4 rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2"
            style={{
              borderColor: "var(--pastel-coral)",
              color: "var(--pastel-coral-dark)",
            }}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          type="submit"
          disabled={loading || deleting}
          className="flex-1 h-12 font-[family-name:var(--font-nunito)] font-bold text-base rounded-xl"
          style={{ backgroundColor: "var(--pastel-blue)", color: "white" }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {isEditing ? "Save Changes" : "Create Expense"}
            </>
          )}
        </Button>
      </div>
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Tabs at top (only for new expense) */}
        {!isEditing && (
          <div className="px-6 pt-4 pb-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList
                className="grid w-full grid-cols-2 h-10 rounded-xl p-1"
                style={{ backgroundColor: "var(--muted)" }}
              >
                <TabsTrigger
                  value="manual"
                  className="rounded-lg font-[family-name:var(--font-nunito)] font-bold text-sm data-[state=active]:bg-white"
                >
                  Manual
                </TabsTrigger>
                <TabsTrigger
                  value="transaction"
                  className="rounded-lg font-[family-name:var(--font-nunito)] font-bold text-sm data-[state=active]:bg-white"
                >
                  From Transaction
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {/* Title right under tabs */}
            <DialogTitle
              className="font-[family-name:var(--font-nunito)] text-lg font-black mt-3"
              style={{ color: "var(--text-primary)" }}
            >
              {activeTab === "manual" ? "New Expense" : "Create from Transaction"}
            </DialogTitle>
          </div>
        )}

        {/* Header (only for editing) */}
        {isEditing && (
          <div
            className="px-6 pt-5 pb-3 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <DialogTitle
              className="font-[family-name:var(--font-nunito)] text-xl font-black"
              style={{ color: "var(--text-primary)" }}
            >
              Edit Expense
            </DialogTitle>
          </div>
        )}

        {/* Content - fixed height with scroll */}
        <div className="px-6 py-5 flex-1 overflow-y-auto min-h-[400px]">
          {isEditing ? (
            <ManualEntryForm />
          ) : activeTab === "manual" ? (
            <ManualEntryForm />
          ) : (
            <ExpenseFromTransaction
              partnershipId={partnershipId}
              onSuccess={() => {
                onClose();
                router.refresh();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
