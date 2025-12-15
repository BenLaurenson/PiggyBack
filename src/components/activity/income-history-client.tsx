"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionDetailModal } from "@/components/activity/transaction-detail-modal";
import { VendorChart } from "@/components/activity/vendor-chart";
import { NumberTicker } from "@/components/ui/number-ticker";
import { TransactionCard } from "@/components/activity/transaction-card";
import { SwipeableCard } from "@/components/activity/swipeable-card";
import { useIncomeConfig } from "@/contexts/income-config-context";
import { motion } from "framer-motion";

const TIME_FILTERS = [
  { label: "This Week", value: "7d" },
  { label: "This Month", value: "this-month" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 3 Months", value: "90d" },
  { label: "This Year", value: "1y" },
  { label: "All Time", value: "all" },
];

const getFilterDate = (filter: string, now: Date): Date => {
  const startOf = new Date(now);

  switch (filter) {
    case "7d":
      startOf.setDate(now.getDate() - 7);
      return startOf;
    case "this-month":
      startOf.setDate(1);
      startOf.setHours(0, 0, 0, 0);
      return startOf;
    case "30d":
      startOf.setDate(now.getDate() - 30);
      return startOf;
    case "90d":
      startOf.setDate(now.getDate() - 90);
      return startOf;
    case "1y":
      startOf.setFullYear(now.getFullYear(), 0, 1);
      startOf.setHours(0, 0, 0, 0);
      return startOf;
    default:
      return new Date(0); // All time
  }
};

interface Transaction {
  id: string;
  description: string;
  amount_cents: number;
  created_at: string;
  settled_at?: string;
  status: string;
  category_id?: string | null;
  parent_category_id?: string | null;
  account_id: string;
  is_income?: boolean;
  accounts?: { display_name: string };
  category?: { name: string; id: string };
  parent_category?: { name: string; id: string };
  transaction_tags?: { tag_name: string }[];
}

interface IncomeHistoryClientProps {
  initialTransactions: Transaction[];
  totalCount: number;
  totalIncome: number;
  averageTransaction: number;
  monthsSince: number;
  chartData: Array<{ month: string; total: number }>;
}

export function IncomeHistoryClient({
  initialTransactions,
  totalCount,
  totalIncome,
  averageTransaction,
  monthsSince,
  chartData,
}: IncomeHistoryClientProps) {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [timeFilter, setTimeFilter] = useState("all");
  const { incomeMode, setIncomeMode } = useIncomeConfig();

  // First filter by income mode (all positive vs marked sources)
  const incomeModeFiltered = useMemo(() => {
    return initialTransactions.filter((t) => {
      if (incomeMode === "marked_sources") {
        return t.is_income === true;
      }
      return t.amount_cents > 0;
    });
  }, [initialTransactions, incomeMode]);

  // Then filter by time range
  const filteredTransactions = useMemo(() => {
    if (timeFilter === "all") return incomeModeFiltered;

    const now = new Date();
    const filterDate = getFilterDate(timeFilter, now);

    return incomeModeFiltered.filter(txn =>
      new Date(txn.settled_at || txn.created_at) >= filterDate
    );
  }, [incomeModeFiltered, timeFilter]);

  // Recalculate stats from filtered transactions
  const filteredStats = useMemo(() => {
    const total = filteredTransactions.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0);
    const count = filteredTransactions.length;
    const average = count > 0 ? total / count : 0;

    // Calculate months since first transaction in filtered set
    const oldest = filteredTransactions[filteredTransactions.length - 1];
    const months = oldest ? Math.max(1, Math.floor(
      (new Date().getTime() - new Date(oldest.settled_at || oldest.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    )) : 1;

    const perMonth = total / months;

    return { total, count, average, months, perMonth };
  }, [filteredTransactions]);

  // Regenerate chart data from filtered transactions
  const filteredChartData = useMemo(() => {
    const monthlyData = filteredTransactions.reduce((acc, txn) => {
      const date = new Date(txn.settled_at || txn.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthKey]) {
        acc[monthKey] = { month: monthKey, total: 0 };
      }
      acc[monthKey].total += Math.abs(txn.amount_cents);
      return acc;
    }, {} as Record<string, { month: string; total: number }>);

    return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredTransactions]);

  return (
    <>
      {/* Income Mode Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIncomeMode("all_positive")}
          className="font-[family-name:var(--font-dm-sans)] text-sm h-8 px-4 rounded-full transition-all duration-200"
          style={{
            backgroundColor: incomeMode === "all_positive" ? "var(--pastel-mint)" : "var(--muted)",
            color: incomeMode === "all_positive" ? "white" : "var(--text-secondary)",
          }}
        >
          All Positive
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIncomeMode("marked_sources")}
          className="font-[family-name:var(--font-dm-sans)] text-sm h-8 px-4 rounded-full transition-all duration-200"
          style={{
            backgroundColor: incomeMode === "marked_sources" ? "var(--pastel-mint)" : "var(--muted)",
            color: incomeMode === "marked_sources" ? "white" : "var(--text-secondary)",
          }}
        >
          Marked Sources
        </Button>
      </div>

      {/* Time Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TIME_FILTERS.map(filter => (
          <Button
            key={filter.value}
            onClick={() => setTimeFilter(filter.value)}
            variant="ghost"
            size="sm"
            className="rounded-xl font-[family-name:var(--font-nunito)] font-semibold transition-all"
            style={{
              backgroundColor: timeFilter === filter.value ? 'var(--pastel-blue)' : 'var(--muted)',
              color: timeFilter === filter.value ? 'white' : 'var(--text-secondary)',
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-lg overflow-hidden" style={{ backgroundColor: 'var(--pastel-mint-light)' }}>
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
              $<NumberTicker value={filteredStats.total / 100} decimalPlaces={2} className="font-[family-name:var(--font-nunito)] font-black" style={{ color: 'var(--text-primary)' }} />
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: 'var(--pastel-mint-dark)' }}>Total Income</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-elevated)' }}>
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
              $<NumberTicker value={filteredStats.perMonth / 100} decimalPlaces={2} className="font-[family-name:var(--font-nunito)] font-black" style={{ color: 'var(--text-primary)' }} />
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Per Month</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg overflow-hidden" style={{ backgroundColor: 'var(--pastel-blue-light)' }}>
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black">
              <NumberTicker value={filteredStats.count} className="font-[family-name:var(--font-nunito)] font-black" style={{ color: 'var(--text-primary)' }} />
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: 'var(--pastel-blue-dark)' }}>Transactions</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg overflow-hidden" style={{ backgroundColor: 'var(--pastel-yellow-light)' }}>
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black flex items-center gap-0.5" style={{ color: 'var(--text-primary)' }}>
              <NumberTicker value={filteredStats.months} className="font-[family-name:var(--font-nunito)] font-black" style={{ color: 'var(--text-primary)' }} />
              <span>mo</span>
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: 'var(--pastel-yellow-dark)' }}>Since</p>
          </CardContent>
        </Card>
      </div>

      {/* Income Trend Chart */}
      {filteredChartData.length > 0 && (
        <Card className="border-0 shadow-lg mt-4" style={{ backgroundColor: 'var(--surface-elevated)' }}>
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              INCOME TREND
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VendorChart data={filteredChartData} />
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      <Card className="border-0 shadow-lg mt-4" style={{ backgroundColor: 'var(--surface-elevated)' }}>
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            TRANSACTIONS ({filteredStats.count})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Group transactions by date */}
            {Object.entries(
              filteredTransactions.slice(0, 100).reduce((groups: Record<string, Transaction[]>, txn) => {
                const date = new Date(txn.settled_at || txn.created_at);
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                let dateKey: string;
                if (date.toDateString() === today.toDateString()) {
                  dateKey = "TODAY";
                } else if (date.toDateString() === yesterday.toDateString()) {
                  dateKey = "YESTERDAY";
                } else {
                  dateKey = date.toLocaleDateString("en-AU", {
                    month: "short",
                    day: "numeric",
                  }).toUpperCase();
                }

                if (!groups[dateKey]) {
                  groups[dateKey] = [];
                }
                groups[dateKey].push(txn);
                return groups;
              }, {})
            ).map(([dateLabel, dayTransactions], groupIndex) => {
              // Calculate daily total
              const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount_cents, 0);
              const dayTotalFormatted = new Intl.NumberFormat("en-AU", {
                style: "currency",
                currency: "AUD",
                minimumFractionDigits: 0,
              }).format(Math.abs(dayTotal) / 100);
              const isNetPositive = dayTotal >= 0;

              return (
                <motion.div
                  key={dateLabel}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: groupIndex * 0.05 }}
                  className="space-y-1"
                >
                  {/* Date Divider */}
                  <div className="flex items-center gap-2 sm:gap-4 py-2">
                    <div className="h-px flex-1" style={{ backgroundColor: 'var(--border)' }} />
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      <span
                        className="font-[family-name:var(--font-nunito)] font-black text-[10px] sm:text-[11px] tracking-widest px-2 sm:px-3 py-1 rounded-full whitespace-nowrap"
                        style={{
                          backgroundColor: 'var(--pastel-yellow-light)',
                          color: 'var(--pastel-yellow-dark)'
                        }}
                      >
                        {dateLabel}
                      </span>
                      <span
                        className="font-[family-name:var(--font-nunito)] text-xs font-bold whitespace-nowrap"
                        style={{
                          color: isNetPositive ? 'var(--pastel-mint-dark)' : 'var(--pastel-coral-dark)'
                        }}
                      >
                        {isNetPositive ? '+' : ''}{dayTotalFormatted}
                      </span>
                    </div>
                    <div className="h-px flex-1" style={{ backgroundColor: 'var(--border)' }} />
                  </div>

                  {/* Transactions for this date */}
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {dayTransactions.map((txn, index) => (
                      <SwipeableCard
                        key={txn.id}
                        onSwipeLeft={() => {}}
                        onSwipeRight={() => {}}
                        disableSwipe={true}
                      >
                        <TransactionCard
                          transaction={txn}
                          index={index}
                          onClick={() => setSelectedTransaction(txn)}
                          showCategory={true}
                        />
                      </SwipeableCard>
                    ))}
                  </div>
                </motion.div>
              );
            })}
            {filteredTransactions.length === 0 && (
              <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                <p className="font-[family-name:var(--font-dm-sans)]">No income transactions in this time period</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        hideTransactionHistory={true}
      />
    </>
  );
}
