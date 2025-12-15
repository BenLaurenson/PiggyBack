"use client";

import { useState, useCallback, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { TransactionDetailModal } from "./transaction-detail-modal";
import { VendorChart } from "./vendor-chart";
import { NumberTicker } from "@/components/ui/number-ticker";
import { useCategoryMapping } from "@/contexts/category-context";

interface Transaction {
  id: string;
  description: string;
  amount_cents: number;
  created_at: string;
  status: string;
  category_id?: string | null;
  parent_category_id?: string | null;
  account_id: string;
  accounts?: { display_name: string };
  category?: { name: string };
  parent_category?: { name: string };
  transaction_tags?: { tag_name: string }[];
  transaction_notes?: Array<{ id: string; note: string; is_partner_visible: boolean; user_id: string }>;
}

interface MerchantHistoryClientProps {
  initialTransactions: Transaction[];
  merchantName: string;
  totalCount: number;
  totalSpent: number;
  averageTransaction: number;
  monthsSince: number;
  chartData: Array<{ month: string; total: number }>;
  showDescription?: boolean; // Show merchant/description in transaction list (for Income page)
}

export function MerchantHistoryClient({
  initialTransactions,
  merchantName,
  totalCount,
  totalSpent: initialTotalSpent,
  averageTransaction: initialAverage,
  monthsSince: initialMonthsSince,
  chartData: initialChartData,
  showDescription = false,
}: MerchantHistoryClientProps) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false); // All transactions loaded initially
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const { getModernDisplayName, getIcon } = useCategoryMapping();

  // Sync transactions when initialTransactions prop changes (e.g., when parent filters)
  useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);

  // Calculate totals first to determine chart type
  const hasExpensesCheck = initialTransactions.some(t => t.amount_cents < 0);
  const hasIncomeCheck = initialTransactions.some(t => t.amount_cents >= 0);

  // Graph filter - default to income if no expenses
  const [graphFilter, setGraphFilter] = useState<"6m" | "1y" | "all">("all");
  const [chartType, setChartType] = useState<"spending" | "income">(
    hasExpensesCheck ? "spending" : "income"
  );

  // Recalculate stats based on filtered transactions AND chart type toggle
  const filteredTransactions = transactions.filter((txn) => {
    // First filter by time range
    if (graphFilter !== "all") {
      const now = new Date();
      const txnDate = new Date(txn.created_at);

      if (graphFilter === "6m") {
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        if (txnDate < sixMonthsAgo) return false;
      }

      if (graphFilter === "1y") {
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        if (txnDate < oneYearAgo) return false;
      }
    }

    // Then filter by transaction type (spending/income) if both exist
    if (hasExpensesCheck && hasIncomeCheck) {
      if (chartType === "spending") {
        return txn.amount_cents < 0;
      } else {
        return txn.amount_cents >= 0;
      }
    }

    return true;
  });

  // Calculate totals based on chartType
  const hasExpenses = filteredTransactions.some(t => t.amount_cents < 0);
  const hasIncome = filteredTransactions.some(t => t.amount_cents >= 0);

  const totalSpent = Math.abs(filteredTransactions.reduce((sum, t) => sum + (t.amount_cents < 0 ? t.amount_cents : 0), 0));
  const totalIncome = filteredTransactions.reduce((sum, t) => sum + (t.amount_cents >= 0 ? t.amount_cents : 0), 0);

  // Display logic based on what's in filtered results
  const displayTotal = hasExpenses ? totalSpent : totalIncome;
  const displayLabel = hasExpenses ? "Total Spent" : "Total Received";

  const relevantTransactions = hasExpenses
    ? filteredTransactions.filter(t => t.amount_cents < 0)
    : filteredTransactions.filter(t => t.amount_cents >= 0);

  const averageTransaction = relevantTransactions.length > 0
    ? displayTotal / relevantTransactions.length
    : 0;

  const filteredCount = filteredTransactions.length;

  // Calculate months since first transaction in filtered set
  const firstFilteredTransaction = filteredTransactions[filteredTransactions.length - 1];
  const monthsSince = firstFilteredTransaction ? Math.max(
    1,
    Math.floor(
      (new Date().getTime() - new Date(firstFilteredTransaction.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    )
  ) : initialMonthsSince;

  // Infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.5,
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      // For now, we're showing all transactions from the server
      setHasMore(false);
    } catch (error) {
      console.error("Failed to load more:", error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore]);

  useEffect(() => {
    if (inView && hasMore && !loading) {
      loadMore();
    }
  }, [inView, hasMore, loading, loadMore]);

  // Calculate income chart data (monthly totals)
  const incomeChartData = transactions.reduce((acc, txn) => {
    if (txn.amount_cents <= 0) return acc; // Skip expenses
    const date = new Date(txn.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, total: 0 };
    }
    acc[monthKey].total += txn.amount_cents;
    return acc;
  }, {} as Record<string, { month: string; total: number }>);

  const incomeChartArray = (Object.values(incomeChartData) as Array<{ month: string; total: number }>).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // Select the appropriate chart data based on type
  const activeChartData = chartType === "spending" ? initialChartData : incomeChartArray;

  // Filter chart data based on selected time range
  const filteredChartData = activeChartData.filter((item) => {
    if (graphFilter === "all") return true;

    const now = new Date();
    const itemDate = new Date(item.month);

    if (graphFilter === "6m") {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      return itemDate >= sixMonthsAgo;
    }

    if (graphFilter === "1y") {
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      return itemDate >= oneYearAgo;
    }

    return true;
  });

  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Spent */}
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{
            backgroundColor: hasExpenses
              ? 'var(--pastel-coral-light)'
              : 'var(--pastel-mint-light)',
          }}
        >
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black flex items-center gap-1"
              style={{ color: 'var(--text-primary)' }}>
              $<NumberTicker
                value={displayTotal / 100}
                decimalPlaces={2}
                className="font-[family-name:var(--font-nunito)] font-black"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1"
              style={{ color: hasExpenses ? 'var(--pastel-coral-dark)' : 'var(--pastel-mint-dark)' }}>
              {displayLabel}
            </p>
          </CardContent>
        </Card>

        {/* Average Transaction */}
        <Card className="border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-elevated)' }}>
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black flex items-center gap-1"
              style={{ color: 'var(--text-primary)' }}>
              $<NumberTicker
                value={averageTransaction / 100}
                decimalPlaces={2}
                className="font-[family-name:var(--font-nunito)] font-black"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1"
              style={{ color: 'var(--text-tertiary)' }}>
              Per Transaction
            </p>
          </CardContent>
        </Card>

        {/* Transaction Count */}
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--pastel-blue-light)',
          }}
        >
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black">
              <NumberTicker
                value={filteredCount}
                className="font-[family-name:var(--font-nunito)] font-black"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1"
              style={{ color: 'var(--pastel-blue-dark)' }}>
              Transactions
            </p>
          </CardContent>
        </Card>

        {/* Since */}
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--pastel-yellow-light)',
          }}
        >
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black flex items-center gap-0.5"
              style={{ color: 'var(--text-primary)' }}>
              <NumberTicker
                value={monthsSince}
                className="font-[family-name:var(--font-nunito)] font-black"
                style={{ color: 'var(--text-primary)' }}
              />
              <span>mo</span>
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1"
              style={{ color: 'var(--pastel-yellow-dark)' }}>
              Since
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart with Type Toggle */}
      {(hasExpenses || hasIncome) && (initialChartData.length > 0 || incomeChartArray.length > 0) && (
        <Card className="border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-elevated)' }}>
          <CardHeader className="pb-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold"
                  style={{ color: 'var(--text-primary)' }}>
                  {chartType === "spending" ? "SPENDING TREND" : "INCOME TREND"}
                </CardTitle>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {/* Chart Type Toggle - ONLY show if BOTH types exist */}
                {hasExpensesCheck && hasIncomeCheck && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setChartType("spending")}
                      className="rounded-full font-[family-name:var(--font-nunito)] font-bold text-xs h-8 px-4 flex-1 sm:flex-none"
                      style={chartType === "spending" ? {
                        backgroundColor: 'var(--pastel-coral)',
                        color: 'white'
                      } : {
                        backgroundColor: 'var(--muted)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Spending
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setChartType("income")}
                      className="rounded-full font-[family-name:var(--font-nunito)] font-bold text-xs h-8 px-4 flex-1 sm:flex-none"
                      style={chartType === "income" ? {
                        backgroundColor: 'var(--pastel-mint)',
                        color: 'white'
                      } : {
                        backgroundColor: 'var(--muted)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Income
                    </Button>
                  </div>
                )}

                {/* Time Range Filters */}
                <div className={`flex gap-2 flex-wrap ${!(hasExpensesCheck && hasIncomeCheck) ? 'sm:ml-auto' : ''}`}>
                  {[
                    { label: "Last 6mo", value: "6m" as const },
                    { label: "This Year", value: "1y" as const },
                    { label: "All Time", value: "all" as const },
                  ].map((filter) => (
                    <Button
                      key={filter.value}
                      variant="ghost"
                      size="sm"
                      onClick={() => setGraphFilter(filter.value)}
                      className="rounded-full font-[family-name:var(--font-nunito)] font-bold text-[11px] h-7 px-3"
                      style={graphFilter === filter.value ? {
                        backgroundColor: 'var(--pastel-blue)',
                        color: 'white'
                      } : {
                        backgroundColor: 'var(--muted)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <VendorChart data={filteredChartData} color={chartType === "income" ? "var(--pastel-mint)" : "var(--pastel-coral)"} />
          </CardContent>
        </Card>
      )}

      {/* Transactions List - Clickable */}
      <Card className="border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-elevated)' }}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold"
              style={{ color: 'var(--text-primary)' }}>
              TRANSACTIONS ({filteredCount})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filteredTransactions.map((txn, index) => (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => setSelectedTransaction(txn)}
                className="py-3 flex items-center justify-between gap-2 group hover:bg-[var(--pastel-blue-light)] -mx-2 sm:-mx-4 px-2 sm:px-4 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  {showDescription ? (
                    <>
                      <p className="font-[family-name:var(--font-nunito)] font-bold text-sm truncate"
                        style={{ color: 'var(--text-primary)' }}>
                        {txn.description}
                      </p>
                      <p className="font-[family-name:var(--font-dm-sans)] text-xs truncate"
                        style={{ color: 'var(--text-tertiary)' }}>
                        {formatDate(txn.created_at)} • {txn.accounts?.display_name}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-[family-name:var(--font-dm-sans)] text-sm truncate"
                        style={{ color: 'var(--text-primary)' }}>
                        {formatDate(txn.created_at)}
                      </p>
                      <p className="font-[family-name:var(--font-dm-sans)] text-xs truncate"
                        style={{ color: 'var(--text-tertiary)' }}>
                        {txn.accounts?.display_name}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  {(() => {
                    const upCatId = txn.category_id ?? null;
                    const upParentId = txn.parent_category_id ?? null;
                    const modernName = getModernDisplayName(upCatId, upParentId);
                    const fallbackName = txn.category?.name || txn.parent_category?.name;
                    const displayName = modernName || fallbackName;

                    return displayName ? (
                      <Badge
                        className="text-xs rounded-full hidden sm:inline-flex"
                        style={{
                          backgroundColor: 'var(--muted)',
                          color: 'var(--text-secondary)',
                          border: 'none'
                        }}
                      >
                        {displayName}
                      </Badge>
                    ) : null;
                  })()}
                  <p className="font-[family-name:var(--font-nunito)] font-bold text-sm sm:text-base whitespace-nowrap"
                    style={{ color: txn.amount_cents < 0 ? 'var(--pastel-coral-dark)' : 'var(--pastel-mint-dark)' }}>
                    {txn.amount_cents < 0 ? "-" : "+"}{formatCurrency(Math.abs(txn.amount_cents))}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Infinite Scroll Trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="py-6 flex justify-center">
              {loading ? (
                <div className="flex items-center gap-2" style={{ color: 'var(--pastel-blue-dark)' }}>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="font-[family-name:var(--font-nunito)] font-bold text-sm">
                    Loading more...
                  </span>
                </div>
              ) : (
                <Button
                  onClick={loadMore}
                  variant="ghost"
                  className="rounded-full font-[family-name:var(--font-nunito)] font-bold px-6"
                  style={{
                    backgroundColor: 'var(--pastel-blue-light)',
                    color: 'var(--pastel-blue-dark)'
                  }}
                >
                  Load More
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Modal - Hide transaction history button since we're already on that page */}
      <TransactionDetailModal
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        hideTransactionHistory={true}
      />
    </>
  );
}
