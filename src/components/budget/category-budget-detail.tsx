"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { TransactionDetailModal } from "@/components/activity/transaction-detail-modal";
import { VendorChart } from "@/components/activity/vendor-chart";
import { NumberTicker } from "@/components/ui/number-ticker";
import { TransactionCard } from "@/components/activity/transaction-card";
import { SwipeableCard } from "@/components/activity/swipeable-card";

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
  settled_at: string;
  created_at: string;
  status: string;
  category_id?: string | null;
  parent_category_id?: string | null;
  account_id: string;
  accounts?: { display_name: string };
  category?: { name: string; id: string };
  parent_category?: { name: string; id: string };
  transaction_tags?: { tag_name: string }[];
}

interface CategoryBudgetDetailProps {
  initialTransactions: Transaction[];
  categoryName: string;
  totalSpent: number;
  transactionCount: number;
  monthsSince: number;
  averagePerMonth: number;
  chartData: Array<{ month: string; total: number }>;
  periodType?: 'weekly' | 'fortnightly' | 'monthly';
}

export function CategoryBudgetDetail({
  initialTransactions,
  categoryName,
  totalSpent,
  transactionCount,
  monthsSince,
  averagePerMonth,
  chartData,
  periodType = 'monthly',
}: CategoryBudgetDetailProps) {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Set default time filter based on period type
  const defaultFilter = periodType === 'weekly' ? '7d' : periodType === 'fortnightly' ? '30d' : 'this-month';
  const [timeFilter, setTimeFilter] = useState(defaultFilter);

  // Check if category has both expenses and income (for toggle)
  const hasExpensesCheck = initialTransactions.some(t => t.amount_cents < 0);
  const hasIncomeCheck = initialTransactions.some(t => t.amount_cents > 0);

  // Chart type toggle - default to spending if expenses exist, otherwise income
  const [chartType, setChartType] = useState<"spending" | "income">(
    hasExpensesCheck ? "spending" : "income"
  );

  // Filter transactions based on selected time range AND chart type
  const filteredTransactions = useMemo(() => {
    let filtered = initialTransactions;

    // Filter by time range
    if (timeFilter !== "all") {
      const now = new Date();
      const filterDate = getFilterDate(timeFilter, now);
      filtered = filtered.filter(txn => new Date(txn.settled_at) >= filterDate);
    }

    // Filter by transaction type if both exist
    if (hasExpensesCheck && hasIncomeCheck) {
      if (chartType === "spending") {
        filtered = filtered.filter(txn => txn.amount_cents < 0);
      } else {
        filtered = filtered.filter(txn => txn.amount_cents > 0);
      }
    }

    return filtered;
  }, [initialTransactions, timeFilter, chartType, hasExpensesCheck, hasIncomeCheck]);

  // Recalculate stats from filtered transactions
  const filteredStats = useMemo(() => {
    const total = Math.abs(filteredTransactions.reduce((sum, t) => sum + t.amount_cents, 0));
    const count = filteredTransactions.length;
    const average = count > 0 ? total / count : 0;

    // Calculate months since first transaction in filtered set
    const oldest = filteredTransactions[filteredTransactions.length - 1];
    const months = oldest ? Math.max(1, Math.floor(
      (new Date().getTime() - new Date(oldest.settled_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    )) : 1;

    const perMonth = total / months;

    // Determine if showing income or spending based on chartType
    const isShowingIncome = chartType === "income" || (!hasExpensesCheck && hasIncomeCheck);
    const label = isShowingIncome ? "Total Received" : "Total Spent";

    return { total, count, average, months, perMonth, isShowingIncome, label };
  }, [filteredTransactions, chartType, hasExpensesCheck, hasIncomeCheck]);

  // Regenerate chart data from filtered transactions
  const filteredChartData = useMemo(() => {
    const monthlyData = filteredTransactions.reduce((acc, txn) => {
      const date = new Date(txn.settled_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthKey]) {
        acc[monthKey] = { month: monthKey, total: 0 };
      }
      acc[monthKey].total += Math.abs(txn.amount_cents);
      return acc;
    }, {} as Record<string, { month: string; total: number }>);

    return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredTransactions]);

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

  return (
    <>
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
        <Card className="border-0 shadow-lg overflow-hidden" style={{ backgroundColor: 'var(--pastel-coral-light)' }}>
          <CardContent className="p-4">
            <div className="font-[family-name:var(--font-nunito)] text-xl sm:text-2xl md:text-3xl font-black flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
              $<NumberTicker value={filteredStats.total / 100} decimalPlaces={2} className="font-[family-name:var(--font-nunito)] font-black" style={{ color: 'var(--text-primary)' }} />
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: 'var(--pastel-coral-dark)' }}>Total Spent</p>
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

      {/* Trend Chart with Type Toggle */}
      {filteredChartData.length > 0 && (
        <Card className="border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-elevated)' }}>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {filteredStats.isShowingIncome ? "INCOME TREND" : "SPENDING TREND"}
              </CardTitle>

              {/* Chart Type Toggle - ONLY show if BOTH types exist */}
              {hasExpensesCheck && hasIncomeCheck && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChartType("spending")}
                    className="rounded-full font-[family-name:var(--font-nunito)] font-bold text-xs h-8 px-4"
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
                    className="rounded-full font-[family-name:var(--font-nunito)] font-bold text-xs h-8 px-4"
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
            </div>
          </CardHeader>
          <CardContent>
            <VendorChart data={filteredChartData} color={filteredStats.isShowingIncome ? "var(--pastel-mint)" : "var(--pastel-coral)"} />
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      <Card className="border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-elevated)' }}>
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
                const date = new Date(txn.created_at || txn.settled_at);
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
              const dayTotalFormatted = formatCurrency(Math.abs(dayTotal));
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
                          showCategory={false}
                        />
                      </SwipeableCard>
                    ))}
                  </div>
                </motion.div>
              );
            })}
            {filteredTransactions.length === 0 && (
              <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                <p className="font-[family-name:var(--font-dm-sans)]">No transactions in this time period</p>
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
        hideCategoryHistory={true}
      />
    </>
  );
}
