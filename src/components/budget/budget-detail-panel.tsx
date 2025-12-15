"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { X, TrendingUp, TrendingDown, Calendar, Receipt, Target, DollarSign, ChevronRight, ChevronDown, Users, Clock, Store, CreditCard, History, Repeat, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/use-media-query";
import { CreateExpenseFromTransactionDialog } from "./create-expense-dialog";
import { BudgetRow, isGoalRow, isAssetRow, isCategoryRow, isSubcategoryRow } from "@/lib/budget-row-types";
import { countOccurrencesInPeriod } from "@/lib/budget-engine";

interface Transaction {
  id: string;
  description: string;
  amount_cents: number;
  settled_at: string;
  merchant_name?: string;
  raw_text?: string;
  account_name?: string;
  category?: string;
  created_at?: string;
  expense_matches?: Array<{
    expense_definition_id: string;
    match_confidence: number;
  }>;
}

interface ExpenseData {
  id: string;
  name: string;
  emoji: string;
  category_name: string;
  expected_amount_cents: number;
  recurrence_type: string;
  next_due_date: string;
  is_matched?: boolean;
  expense_matches?: Array<{
    transaction_id: string;
    transactions?: {
      amount_cents: number;
      settled_at?: string | null;
      created_at?: string;
    } | null;
  }>;
}

interface BudgetDetailPanelProps {
  item: BudgetRow | null;
  expenses: ExpenseData[];
  partnershipId: string;
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
  onEditExpense?: (expenseId: string) => void;
  onQuickAssign?: (itemId: string, amount: number) => void;
  className?: string;
}

/**
 * For sub-monthly budget periods (weekly/fortnightly), monthly+ expenses would
 * show 0 expected payments because the budget window is too narrow for
 * countOccurrencesInPeriod to find any occurrences.
 *
 * Example: a fortnightly budget covering Feb 1-14 with a monthly rent expense
 * due on the 20th -- without expansion, countOccurrencesInPeriod returns 0
 * because the due date falls outside the budget window.
 *
 * Solution: expand the evaluation window to the full calendar month so
 * monthly/quarterly/yearly expenses are evaluated correctly. This ensures the
 * Expected Bills card shows all bills due this month, even in sub-monthly budgets.
 */
function getEffectiveWindow(recurrenceType: string, periodStart: Date, periodEnd: Date): [Date, Date] {
  const periodDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000);

  if (['monthly', 'quarterly', 'yearly'].includes(recurrenceType) && periodDays < 28) {
    // Expand to full month so monthly+ expenses are evaluated across the whole month
    return [
      new Date(periodStart.getFullYear(), periodStart.getMonth(), 1),
      new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59, 999),
    ];
  }

  return [periodStart, periodEnd];
}

/**
 * Calculates how many payments are expected for an expense within a period.
 *
 * Primary path: delegates to countOccurrencesInPeriod from budget-engine using
 * the expense's next_due_date as an anchor. This ensures the Expected Bills card
 * matches the engine's AUTO budget calculation exactly (both use the same
 * anchor-based counting logic).
 *
 * Fallback path: for expenses without a next_due_date, uses a simple heuristic
 * based on period length. Rarely hit in practice since most expenses have a due date.
 */
function getExpectedPaymentsInPeriod(expense: ExpenseData, periodStart: Date, periodEnd: Date): number {
  if (expense.next_due_date) {
    return countOccurrencesInPeriod(expense.next_due_date, expense.recurrence_type, periodStart, periodEnd);
  }
  // Fallback heuristic for expenses without a due date
  const periodDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000);
  switch (expense.recurrence_type) {
    case 'weekly': return Math.max(1, Math.round(periodDays / 7));
    case 'fortnightly': return Math.max(1, Math.round(periodDays / 14));
    case 'monthly': return 1;
    case 'quarterly': return periodDays >= 80 ? 1 : 0;
    case 'yearly': return periodDays >= 350 ? 1 : 0;
    default: return 1;
  }
}

/**
 * Counts how many of an expense's matched transactions fall within the given period.
 * Uses settled_at (preferred) or created_at as the transaction date.
 * Combined with getExpectedPaymentsInPeriod, this determines paid vs unpaid
 * status for the Expected Bills card.
 */
function getMatchedPaymentsInPeriod(expense: ExpenseData, periodStart: Date, periodEnd: Date): number {
  if (!expense.expense_matches) return 0;
  return expense.expense_matches.filter(m => {
    const txn = m.transactions;
    if (!txn) return false;
    const dateStr = txn.settled_at || txn.created_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= periodStart && d <= periodEnd;
  }).length;
}

export function BudgetDetailPanel({
  item,
  expenses,
  partnershipId,
  periodStart,
  periodEnd,
  onClose,
  onEditExpense,
  onQuickAssign,
  className = "",
}: BudgetDetailPanelProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);
  const [expenseDialogTxn, setExpenseDialogTxn] = useState<Transaction | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const shouldReduceMotion = useReducedMotion();

  // In individual budget view, transactions matched to shared expenses need their
  // displayed amounts adjusted by the user's split percentage. This map pre-computes
  // transaction_id -> { splitPercentage, expenseName } from each expense's split data.
  // Built from viewAdjustedExpenses which already has split percentages applied by the shell.
  const transactionSplitMap = useMemo(() => {
    const map = new Map<string, { splitPercentage: number; expenseName: string }>();

    expenses.forEach((expense: any) => {
      // Only process expenses with split_percentage set (from viewAdjustedExpenses)
      if (expense.split_percentage && expense.split_percentage !== 100) {
        // Get expense matches (transaction IDs linked to this expense)
        const matches = expense.expense_matches || [];
        matches.forEach((match: any) => {
          if (match.transaction_id) {
            map.set(match.transaction_id, {
              splitPercentage: expense.split_percentage,
              expenseName: expense.name,
            });
          }
        });
      }
    });

    return map;
  }, [expenses]);

  // Fetch transactions when item changes
  useEffect(() => {
    // Reset expanded state when item changes
    setExpandedTxnId(null);

    if (!item || item.id === '__goals__' || item.id === '__investments__') {
      setTransactions([]);
      return;
    }

    const fetchTransactions = async () => {
      setLoading(true);
      try {
        // API expects: type, id, partnership_id, period_start, period_end
        // For categories/subcategories, id is the name
        // For goals/assets, id is the actual UUID
        const params = new URLSearchParams({
          partnership_id: partnershipId,
          period_start: periodStart,
          period_end: periodEnd,
          type: item.type,
          id: item.type === 'goal' || item.type === 'asset' ? item.id : item.name,
        });

        // For subcategories, add parent_category for disambiguation
        if (isSubcategoryRow(item)) {
          params.set('parent_category', item.parentCategory);
        }

        // For methodology categories with underlying UP Bank categories
        if (isCategoryRow(item) && item.underlyingCategories?.length) {
          params.set('underlying_categories', item.underlyingCategories.join(','));
        }

        const response = await fetch(`/api/budget/row-transactions?${params}`);
        if (response.ok) {
          const data = await response.json();
          setTransactions(data.transactions || []);
        }
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [item, partnershipId, periodStart, periodEnd]);

  // Get expenses for this item — only match by inferred subcategory
  const itemExpenses = expenses.filter((e: any) => {
    if (!item) return false;
    if (isSubcategoryRow(item)) {
      return e.inferred_subcategory === item.name &&
        (e.inferred_parent_category || e.category_name) === item.parentCategory;
    }
    return false;
  });

  // Build expense ID → name lookup for paid badge on transactions
  const expenseNameMap = useMemo(() => {
    const map = new Map<string, string>();
    itemExpenses.forEach(e => map.set(e.id, e.name));
    return map;
  }, [itemExpenses]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-AU", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-AU", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    };
  };

  const toggleTransaction = (txnId: string) => {
    setExpandedTxnId(prev => prev === txnId ? null : txnId);
  };

  if (!item) return null;

  // Calculate progress and status
  const available = item.assigned - item.spent;
  const spentPercentage = item.assigned > 0 ? Math.min((item.spent / item.assigned) * 100, 100) : 0;
  const isOverBudget = item.spent > item.assigned && item.assigned > 0;
  const isGoal = isGoalRow(item);
  const isAsset = isAssetRow(item);

  // Goal progress
  const goalProgress = isGoal && item.target ? (item.currentAmount || 0) / item.target * 100 : 0;

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{item.icon}</span>
          <div>
            <h2 className="font-[family-name:var(--font-nunito)] font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              {item.name}
            </h2>
            {isSubcategoryRow(item) && (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {item.parentCategory}
              </p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Close">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary Card */}
        <Card className="border-2" style={{ borderColor: 'var(--border)' }}>
          <CardContent className="pt-4 space-y-3">
            {isGoal ? (
              // Goal summary
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Progress</span>
                  <span className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: item.color || 'var(--text-primary)' }}>
                    {formatCurrency(item.currentAmount || 0)} / {formatCurrency(item.target || 0)}
                  </span>
                </div>
                <Progress
                  value={goalProgress}
                  className="h-2"
                  style={{ '--progress-background': item.color } as any}
                />
                <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span>{Math.round(goalProgress)}% complete</span>
                  <span>{formatCurrency((item.target || 0) - (item.currentAmount || 0))} to go</span>
                </div>
              </>
            ) : isAsset ? (
              // Asset summary
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Current Value</span>
                  <span className="font-[family-name:var(--font-nunito)] font-bold text-lg" style={{ color: 'var(--accent-teal)' }}>
                    {formatCurrency(item.currentValue || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>This Period Assigned</span>
                  <span className="font-medium">{formatCurrency(item.assigned)}</span>
                </div>
              </>
            ) : (
              // Category summary
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Assigned</p>
                    <p className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(item.assigned)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Spent</p>
                    <p className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: isOverBudget ? 'var(--error)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(item.spent)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Available</p>
                    <p className="font-[family-name:var(--font-nunito)] font-bold"
                      style={{ color: available >= 0 ? 'var(--accent-teal)' : 'var(--error)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(available)}
                    </p>
                  </div>
                </div>
                <Progress
                  value={spentPercentage}
                  className="h-2"
                />
                {isCategoryRow(item) && item.targetPercentage && (
                  <div className="flex items-center gap-2 pt-2">
                    <Badge variant="outline" className="text-xs">
                      {item.targetPercentage}% of income
                    </Badge>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Suggested Savings for Goals */}
        {isGoal && item.suggestedSavings && item.suggestedSavings.hasDeadline && (item.target || 0) - (item.currentAmount || 0) > 0 && (
          <Card className="border-2" style={{ borderColor: 'var(--border)' }}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4" style={{ color: 'var(--accent-teal)' }} aria-hidden="true" />
                <span className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Suggested savings
                </span>
                {item.suggestedSavings.daysRemaining !== null && item.suggestedSavings.daysRemaining > 0 && (
                  <Badge variant="outline" className="text-xs ml-auto">
                    {item.suggestedSavings.daysRemaining}d left
                  </Badge>
                )}
                {item.suggestedSavings.daysRemaining === 0 && (
                  <Badge variant="outline" className="text-xs ml-auto" style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
                    Overdue
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--surface-elevated)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>W</p>
                  <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(item.suggestedSavings.weekly)}
                  </p>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--surface-elevated)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>F</p>
                  <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(item.suggestedSavings.fortnightly)}
                  </p>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--surface-elevated)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>M</p>
                  <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(item.suggestedSavings.monthly)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Assign Button */}
        {onQuickAssign && item.id !== '__goals__' && item.id !== '__investments__' && (
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => onQuickAssign(item.id, 0)}
            style={{
              borderColor: 'var(--pastel-mint)',
              color: 'var(--pastel-mint-dark)',
            }}
          >
            <DollarSign className="h-4 w-4 mr-2" aria-hidden="true" />
            Quick Assign
          </Button>
        )}

        {/* Transactions Section */}
        {item.id !== '__goals__' && item.id !== '__investments__' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                Transactions
              </h3>
              <Badge variant="secondary" className="text-xs">
                {transactions.length}
              </Badge>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-6 rounded-lg" style={{ backgroundColor: 'var(--surface-elevated)' }}>
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  No transactions this period
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {transactions.slice(0, 15).map(txn => {
                  const isExpanded = expandedTxnId === txn.id;
                  const dateTime = formatDateTime(txn.settled_at);
                  // Check if this specific transaction has a split from expense matching
                  const txnSplit = transactionSplitMap.get(txn.id);

                  return (
                    <div key={txn.id}>
                      <button
                        onClick={() => toggleTransaction(txn.id)}
                        className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--pastel-blue)] focus-visible:outline-none"
                        style={{
                          backgroundColor: isExpanded ? 'var(--surface-elevated)' : 'transparent',
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <motion.div
                            initial={false}
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                          >
                            <ChevronDown
                              className="h-4 w-4 flex-shrink-0"
                              style={{ color: 'var(--text-tertiary)' }}
                              aria-hidden="true"
                            />
                          </motion.div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-[family-name:var(--font-dm-sans)] text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                              {txn.description || txn.merchant_name || 'Transaction'}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {formatDate(txn.settled_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {txn.expense_matches && txn.expense_matches.length > 0 && (
                            <CheckCircle2
                              className="h-4 w-4 flex-shrink-0"
                              style={{ color: 'var(--pastel-mint-dark)' }}
                              aria-hidden="true"
                            />
                          )}
                          {txnSplit && (
                            <Badge
                              variant="outline"
                              className="text-xs px-1.5 py-0"
                              style={{
                                borderColor: 'var(--pastel-blue)',
                                backgroundColor: 'var(--pastel-blue-light)',
                                color: 'var(--pastel-blue-dark)',
                              }}
                            >
                              {txnSplit.splitPercentage}%
                            </Badge>
                          )}
                          <span className="font-[family-name:var(--font-dm-sans)] font-medium text-sm" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(Math.abs(
                              txnSplit
                                ? Math.round(txn.amount_cents * txnSplit.splitPercentage / 100)
                                : txn.amount_cents
                            ))}
                          </span>
                        </div>
                      </button>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            animate={shouldReduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                            className="overflow-hidden"
                          >
                            <div
                              className="mx-6 mb-2 p-3 rounded-lg space-y-2"
                              style={{ backgroundColor: 'var(--pastel-blue-light)' }}
                            >
                              {/* Date & Time */}
                              <div className="flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5" style={{ color: 'var(--pastel-blue-dark)' }} aria-hidden="true" />
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  {dateTime.date} at {dateTime.time}
                                </span>
                              </div>

                              {/* Merchant */}
                              {txn.merchant_name && txn.merchant_name !== txn.description && (
                                <div className="flex items-center gap-2">
                                  <Store className="h-3.5 w-3.5" style={{ color: 'var(--pastel-blue-dark)' }} aria-hidden="true" />
                                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {txn.merchant_name}
                                  </span>
                                </div>
                              )}

                              {/* Account */}
                              {txn.account_name && (
                                <div className="flex items-center gap-2">
                                  <CreditCard className="h-3.5 w-3.5" style={{ color: 'var(--pastel-blue-dark)' }} aria-hidden="true" />
                                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {txn.account_name}
                                  </span>
                                </div>
                              )}

                              {/* Raw Text / Full Description */}
                              {txn.raw_text && txn.raw_text !== txn.description && (
                                <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    {txn.raw_text}
                                  </p>
                                </div>
                              )}

                              {/* View Merchant History Button */}
                              {txn.description && (
                                <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
                                  <Link
                                    href={`/activity/merchant/${encodeURIComponent(txn.description)}?from=budget`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full rounded-lg text-xs"
                                      style={{
                                        borderColor: 'var(--pastel-blue)',
                                        color: 'var(--pastel-blue-dark)',
                                      }}
                                    >
                                      <History className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                                      View Merchant History
                                    </Button>
                                  </Link>
                                  {txn.amount_cents < 0 && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full rounded-lg text-xs"
                                      style={{
                                        borderColor: 'var(--pastel-mint)',
                                        color: 'var(--pastel-mint-dark)',
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpenseDialogTxn(txn);
                                      }}
                                    >
                                      <Repeat className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                                      Recurring Expense
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
                {transactions.length > 15 && (
                  <p className="text-xs text-center pt-2" style={{ color: 'var(--text-tertiary)' }}>
                    +{transactions.length - 15} more transactions\u2026
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Expected Bills Section
            For each expense linked to the selected budget item, calculates expected
            vs actual payments. Uses getEffectiveWindow to handle sub-monthly budgets
            correctly. Shows "All bills paid" when matched payments >= expected payments;
            otherwise shows individual unpaid bills with remaining amounts. */}
        {itemExpenses.length > 0 && (() => {
          const pStart = new Date(periodStart);
          const pEnd = new Date(periodEnd);

          // For each expense, calculate expected vs actual payments in this period.
          // When the budget period is shorter than the expense recurrence (e.g. fortnightly
          // budget with monthly bills), expand the evaluation window to the full recurrence
          // period so matches from any sub-period are counted correctly.
          const expensePaymentInfo = itemExpenses.map(e => {
            const recurrence = (e as any).recurrence_type || 'monthly';
            const [evalStart, evalEnd] = getEffectiveWindow(recurrence, pStart, pEnd);
            const expectedCount = getExpectedPaymentsInPeriod(e, evalStart, evalEnd);
            const matchedCount = getMatchedPaymentsInPeriod(e, evalStart, evalEnd);
            return { expense: e, expectedCount, matchedCount, fullyPaid: matchedCount >= expectedCount };
          });

          const totalExpectedPayments = expensePaymentInfo.reduce((sum, i) => sum + i.expectedCount, 0);
          const totalMatchedPayments = expensePaymentInfo.reduce((sum, i) => sum + i.matchedCount, 0);
          const totalCoveredAmount = expensePaymentInfo.reduce((sum, i) => sum + (i.matchedCount * i.expense.expected_amount_cents), 0);
          const totalExpectedAmount = expensePaymentInfo.reduce((sum, i) => sum + (i.expectedCount * i.expense.expected_amount_cents), 0);
          const allPaid = totalMatchedPayments >= totalExpectedPayments;
          const unpaidExpenseInfo = expensePaymentInfo.filter(i => !i.fullyPaid);

          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Expected Bills
                </h3>
                <div className="flex items-center gap-1.5">
                  {totalMatchedPayments > 0 && (
                    <Badge
                      className="text-[10px] px-1.5 py-0"
                      style={{ backgroundColor: 'var(--pastel-mint)', color: 'var(--pastel-mint-dark)' }}
                    >
                      {totalMatchedPayments} of {totalExpectedPayments} covered
                    </Badge>
                  )}
                </div>
              </div>

              {allPaid ? (
                <div
                  className="text-center py-4 rounded-lg"
                  style={{ backgroundColor: 'var(--pastel-mint-light)', border: '1px solid var(--pastel-mint)' }}
                >
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5" style={{ color: 'var(--pastel-mint-dark)' }} aria-hidden="true" />
                  <p className="text-sm font-medium" style={{ color: 'var(--pastel-mint-dark)' }}>
                    All bills paid
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {formatCurrency(totalCoveredAmount)} covered this period
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unpaidExpenseInfo.map(({ expense, expectedCount, matchedCount }) => {
                    const isOverdue = new Date(expense.next_due_date) < new Date();
                    const remainingPayments = expectedCount - matchedCount;
                    return (
                      <button
                        key={expense.id}
                        onClick={() => onEditExpense?.(expense.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border transition-colors hover:border-[var(--pastel-coral)] focus-visible:ring-2 focus-visible:ring-[var(--pastel-coral)] focus-visible:outline-none"
                        style={{
                          borderColor: isOverdue ? 'var(--pastel-coral)' : 'var(--border)',
                          backgroundColor: isOverdue ? 'var(--pastel-coral-light)' : 'transparent',
                        }}
                      >
                        <span className="text-lg">{expense.emoji}</span>
                        <div className="flex-1 text-left">
                          <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-primary)' }}>
                            {expense.name}
                          </p>
                          <p className="text-xs" style={{ color: isOverdue ? 'var(--pastel-coral-dark)' : 'var(--text-tertiary)' }}>
                            {expectedCount > 1
                              ? `${matchedCount} of ${expectedCount} paid${isOverdue ? ' · next is overdue' : ''}`
                              : isOverdue ? 'Overdue' : `Due ${formatDate(expense.next_due_date)}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(remainingPayments * expense.expected_amount_cents)}
                          </p>
                          {expectedCount > 1 && (
                            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                              {remainingPayments} remaining
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
                      </button>
                    );
                  })}

                  {/* Summary */}
                  <div className="flex justify-between text-xs px-1 pt-1" style={{ color: 'var(--text-tertiary)' }}>
                    <span>Total expected</span>
                    <span className="font-semibold">{formatCurrency(totalExpectedAmount)}</span>
                  </div>
                  {totalCoveredAmount > 0 && (
                    <div className="flex justify-between text-xs px-1" style={{ color: 'var(--pastel-mint-dark)' }}>
                      <span>Covered so far</span>
                      <span className="font-semibold">{formatCurrency(totalCoveredAmount)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      {/* Create Expense Dialog */}
      <CreateExpenseFromTransactionDialog
        transaction={expenseDialogTxn}
        open={!!expenseDialogTxn}
        onOpenChange={(open) => !open && setExpenseDialogTxn(null)}
      />
      </div>
    </div>
  );

  // Desktop: Side panel using motion
  if (isDesktop) {
    return (
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
        animate={shouldReduceMotion ? { opacity: 1, width: 400 } : { width: 400, opacity: 1 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeInOut" }}
        className={`flex-shrink-0 border overflow-hidden bg-surface-white rounded-2xl shadow-lg sticky top-4 ${className}`}
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--card)',
          maxHeight: 'calc(100vh - 2rem)', // Fill viewport minus padding
        }}
      >
        {panelContent}
      </motion.div>
    );
  }

  // Mobile: Bottom sheet
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0" showCloseButton={false}>
        <SheetHeader className="sr-only">
          <SheetTitle>{item.name}</SheetTitle>
        </SheetHeader>
        {panelContent}
      </SheetContent>
    </Sheet>
  );
}
