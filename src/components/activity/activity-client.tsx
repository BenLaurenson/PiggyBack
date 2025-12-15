"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { TransactionCard } from "./transaction-card";
import { SwipeableCard } from "./swipeable-card";
import { TransactionSkeletonList } from "./transaction-skeleton";
import { TransactionDetailModal } from "./transaction-detail-modal";
import { EnhancedFilters } from "./enhanced-filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2, TrendingDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { markTransactionAsIncome } from "@/app/actions/transactions";
import { ExportDialog } from "@/components/shared/export-dialog";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { NumberTicker } from "@/components/ui/number-ticker";
import { useCategoryMapping } from "@/contexts/category-context";
import { useIncomeConfig } from "@/contexts/income-config-context";

interface Transaction {
  id: string;
  description: string;
  amount_cents: number;
  created_at: string;
  status: string;
  category_id?: string | null;
  parent_category_id?: string | null;
  foreign_amount_cents?: number | null;
  foreign_currency_code?: string | null;
  round_up_amount_cents?: number | null;
  cashback_amount_cents?: number | null;
  account_id: string;
  accounts?: { display_name: string };
  category?: { name: string } | { name: string }[];
  parent_category?: { name: string } | { name: string }[];
  transaction_tags?: { tag_name: string }[];
  transaction_notes?: Array<{ id: string; note: string; is_partner_visible: boolean; user_id: string }>;
}

interface InitialFilters {
  categoryName?: string;
  search?: string;
  dateRange?: string;
  incomeSource?: string;
}

interface ActivityClientProps {
  initialTransactions: Transaction[];
  accounts: Array<{ id: string; display_name: string }>;
  categories: Array<{ id: string; name: string; parent_category_id?: string | null }>;
  monthlySpending: number;
  monthlyIncome: number;
  thisMonthCount: number;
  availableYears: number[];
  totalCount: number;
  allTimeSpending?: number;
  allTimeIncome?: number;
  allTimeSpendingCount?: number;
  initialFilters?: InitialFilters;
  referrer?: string;  // Where the user came from (for smart back button)
}

export function ActivityClient({
  initialTransactions,
  accounts,
  categories,
  monthlySpending,
  monthlyIncome,
  thisMonthCount,
  availableYears,
  totalCount: initialTotalCount,
  allTimeSpending,
  allTimeIncome,
  allTimeSpendingCount,
  initialFilters,
  referrer,
}: ActivityClientProps) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialTransactions.length >= 25);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Summary totals from API - Initialize with all-time totals from server
  const [summarySpending, setSummarySpending] = useState(allTimeSpending || 0);
  const [summaryIncome, setSummaryIncome] = useState(allTimeIncome || 0);
  const [summarySpendingCount, setSummarySpendingCount] = useState(allTimeSpendingCount || 0);

  const router = useRouter();
  const { incomeMode } = useIncomeConfig();

  // Ref to skip first render of useEffect
  const isFirstRender = useRef(true);

  // Filter states - Initialize from URL params if provided
  const [searchTerm, setSearchTerm] = useState(initialFilters?.search || initialFilters?.incomeSource || "");
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [dateRange, setDateRange] = useState(initialFilters?.dateRange || "all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [includeTransfers, setIncludeTransfers] = useState(false);

  // Track if we have URL-based filters (to show back button)
  // Only show for income source filter since categories now go to /budget/[category]
  const hasUrlFilters = !!initialFilters?.incomeSource;

  // Infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.5,
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(cents / 100);
  };

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        offset: transactions.length.toString(),
        limit: "25",
      });

      if (searchTerm) params.set("search", searchTerm);

      // Handle multi-account selection
      if (selectedAccounts.length > 0) {
        params.set("accountId", selectedAccounts.join(','));
      } else if (selectedAccount !== "all") {
        params.set("accountId", selectedAccount);
      }

      // Handle multi-category selection
      if (selectedCategories.length > 0) {
        params.set("categoryId", selectedCategories.join(','));
      }

      if (selectedStatus !== "all") params.set("status", selectedStatus);

      // Handle multi-year selection
      if (selectedYears.length > 0) {
        params.set("years", selectedYears.join(','));
      } else if (selectedYear !== "all") {
        params.set("year", selectedYear);
      }
      if (dateRange !== "all") params.set("dateRange", dateRange);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (minAmount) params.set("minAmount", minAmount);
      if (maxAmount) params.set("maxAmount", maxAmount);
      if (includeTransfers) params.set("includeTransfers", "true");

      const response = await fetch(`/api/transactions?${params.toString()}`);
      const data = await response.json();

      if (data.transactions && data.transactions.length > 0) {
        setTransactions(prev => [...prev, ...data.transactions]);
        setHasMore(data.hasMore);
      } else {
        setHasMore(false);
      }

      // Note: Don't update summary in loadMore - only update when filters change
      // Summary should only be updated by refetchTransactions to avoid accidental overrides
    } catch (error) {
      console.error("Failed to load more transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, transactions.length, searchTerm, selectedAccount, selectedCategory, selectedStatus, selectedYear, startDate, endDate, minAmount, maxAmount]);

  // Trigger load more when scrolling into view
  useEffect(() => {
    if (inView && hasMore && !loading) {
      loadMore();
    }
  }, [inView, hasMore, loading, loadMore]);

  // Refetch when filters change (skip first render to prevent unnecessary API call)
  useEffect(() => {
    // Skip the first render - we already have accurate server data
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const refetchTransactions = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          offset: "0",
          limit: "25",
        });

        if (searchTerm) params.set("search", searchTerm);

        // Handle multi-account selection
        if (selectedAccounts.length > 0) {
          params.set("accountId", selectedAccounts.join(','));
        } else if (selectedAccount !== "all") {
          params.set("accountId", selectedAccount);
        }

        // Handle multi-category selection
        if (selectedCategories.length > 0) {
          params.set("categoryId", selectedCategories.join(','));
        }

        if (selectedStatus !== "all") params.set("status", selectedStatus);

        // Handle multi-year selection
        if (selectedYears.length > 0) {
          params.set("years", selectedYears.join(','));
        } else if (selectedYear !== "all") {
          params.set("year", selectedYear);
        }
        if (dateRange !== "all") params.set("dateRange", dateRange);
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (minAmount) params.set("minAmount", minAmount);
        if (maxAmount) params.set("maxAmount", maxAmount);
        if (includeTransfers) params.set("includeTransfers", "true");
        params.set("incomeMode", incomeMode);

        const response = await fetch(`/api/transactions?${params.toString()}`);
        const data = await response.json();

        setTransactions(data.transactions || []);
        setTotalCount(data.total || 0);
        setHasMore(data.hasMore);

        // Update summary totals
        if (data.summary) {
          setSummarySpending(data.summary.spending);
          setSummaryIncome(data.summary.income);
          setSummarySpendingCount(data.summary.spendingCount);
        }
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setLoading(false);
      }
    };

    refetchTransactions();
  }, [searchTerm, selectedAccount, selectedAccounts, selectedCategory, selectedCategories, selectedStatus, selectedYear, selectedYears, dateRange, startDate, endDate, minAmount, maxAmount, includeTransfers, incomeMode]);

  const handleMarkAsIncome = async (transactionId: string) => {
    const result = await markTransactionAsIncome(transactionId, true, "other");
    if (!result.error) {
      router.refresh();
    }
  };

  const handleDelete = async (transactionId: string) => {
    // TODO: Implement delete action
  };

  const handleShare = async (transactionId: string) => {
    // TODO: Implement share toggle
  };

  const handleNote = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };

  // Count active filters
  const activeFilterCount = [
    searchTerm,
    selectedAccount !== "all" ? selectedAccount : "",
    selectedCategory !== "all" ? selectedCategory : "",
    selectedStatus !== "all" ? selectedStatus : "",
    selectedYear !== "all" ? selectedYear : "",
    startDate,
    endDate,
    minAmount,
    maxAmount,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedAccount("all");
    setSelectedAccounts([]);
    setSelectedCategory("all");
    setSelectedCategories([]);
    setSelectedStatus("all");
    setDateRange("all");
    setSelectedYear("all");
    setSelectedYears([]);
    setStartDate("");
    setEndDate("");
    setMinAmount("");
    setMaxAmount("");
    setIncludeTransfers(false);
  };

  // Dynamic label based on active filters
  const getFilterLabel = () => {
    if (dateRange === "7d") return "This Week";
    if (dateRange === "this-month") return "This Month";
    if (dateRange === "30d") return "Last 30 Days";
    if (dateRange === "90d") return "Last 3 Months";
    if (dateRange === "1y") return "This Year";
    if (dateRange === "all") return "All Time";
    if (selectedYear !== "all") return selectedYear;
    if (startDate && endDate) return "Custom Range";
    if (startDate) return `From ${new Date(startDate).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}`;
    if (endDate) return `Until ${new Date(endDate).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}`;
    return "All Time";
  };

  const filterLabel = getFilterLabel();

  // Use summary totals from API (accurate for all matching transactions)
  const displaySpending = summarySpending || 0;
  const displayIncome = summaryIncome || 0;
  const displaySpendingCount = summarySpendingCount || 0;

  // Build active filter badges for display - Include ALL filters
  const activeFilters: Array<{ label: string; key: string; onRemove: () => void }> = [];

  if (searchTerm) activeFilters.push({ label: `🔍 "${searchTerm}"`, key: "search", onRemove: () => setSearchTerm("") });

  // Account filter badges
  selectedAccounts.forEach((accId, index) => {
    const acc = accounts.find(a => a.id === accId);
    activeFilters.push({
      label: `💳 ${acc?.display_name || "Account"}`,
      key: `account-${index}`,
      onRemove: () => setSelectedAccounts(selectedAccounts.filter(id => id !== accId))
    });
  });

  // Category filter badges - show modern category names
  selectedCategories.forEach((catId, index) => {
    const mapping = useCategoryMapping().getMappedCategory(catId);
    const categoryLabel = mapping
      ? `${mapping.newParentName} › ${mapping.newChildName}`
      : catId;

    activeFilters.push({
      label: `🏷️ ${categoryLabel}`,
      key: `category-${index}`,
      onRemove: () => setSelectedCategories(selectedCategories.filter(id => id !== catId))
    });
  });

  if (dateRange !== "all") {
    const dateLabels: Record<string, string> = {
      "7d": "This Week",
      "this-month": "This Month",
      "30d": "Last 30 Days",
      "90d": "Last 3 Months",
      "1y": "This Year"
    };
    activeFilters.push({
      label: `📅 ${dateLabels[dateRange] || dateRange}`,
      key: "dateRange",
      onRemove: () => setDateRange("all")
    });
  }

  // Year filter badges
  selectedYears.forEach((year, index) => {
    activeFilters.push({
      label: `📆 ${year}`,
      key: `year-${index}`,
      onRemove: () => setSelectedYears(selectedYears.filter(y => y !== year))
    });
  });

  if (startDate || endDate) {
    const dateRangeLabel = startDate && endDate
      ? `${startDate} → ${endDate}`
      : startDate
      ? `From ${startDate}`
      : `Until ${endDate}`;
    activeFilters.push({
      label: `📅 ${dateRangeLabel}`,
      key: "customDate",
      onRemove: () => { setStartDate(""); setEndDate(""); }
    });
  }

  if (selectedStatus !== "all") {
    const statusLabels: Record<string, string> = {
      "SETTLED": "Settled",
      "HELD": "Pending"
    };
    activeFilters.push({
      label: `⏱️ ${statusLabels[selectedStatus] || selectedStatus}`,
      key: "status",
      onRemove: () => setSelectedStatus("all")
    });
  }

  if (minAmount || maxAmount) {
    const amountLabel = minAmount && maxAmount
      ? `$${minAmount} - $${maxAmount}`
      : minAmount
      ? `> $${minAmount}`
      : `< $${maxAmount}`;
    activeFilters.push({
      label: `💰 ${amountLabel}`,
      key: "amount",
      onRemove: () => { setMinAmount(""); setMaxAmount(""); }
    });
  }

  if (includeTransfers) {
    activeFilters.push({
      label: `🔄 Transfers`,
      key: "transfers",
      onRemove: () => setIncludeTransfers(false)
    });
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Back Button - Show when navigating from Budget with income source filter */}
      {hasUrlFilters && initialFilters?.incomeSource && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <Link
            href="/budget"
            className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Budget
          </Link>
          <span
            className="font-[family-name:var(--font-nunito)] text-sm font-bold px-3 py-1 rounded-full"
            style={{ backgroundColor: 'var(--pastel-mint-light)', color: 'var(--pastel-mint-dark)' }}
          >
            {initialFilters.incomeSource}
          </span>
        </motion.div>
      )}

      {/* Summary Cards - Pastel Gradient Style */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {/* Spending Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card
            className="relative overflow-hidden border-0 shadow-lg transition-all duration-300"
            style={{
              backgroundColor: 'var(--pastel-coral-light)',
            }}
          >
            {/* Decorative circles */}
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full opacity-20"
              style={{ backgroundColor: 'var(--pastel-coral-dark)' }} />
            <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full opacity-15"
              style={{ backgroundColor: 'var(--pastel-coral-dark)' }} />

            <CardHeader className="pb-1 relative z-10 p-3 md:p-6">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}>
                  <TrendingDown className="h-4 w-4" style={{ color: 'var(--pastel-coral-dark)' }} />
                </div>
                <CardDescription className="font-[family-name:var(--font-dm-sans)] font-medium"
                  style={{ color: 'var(--pastel-coral-dark)' }}>
                  Spending
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0 px-3 pb-3 md:px-6 md:pb-6">
              <div className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-black flex items-center gap-1"
                style={{ color: 'var(--text-primary)' }}>
                $<NumberTicker
                  value={displaySpending / 100}
                  decimalPlaces={2}
                  className="font-[family-name:var(--font-nunito)] font-black"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-0.5"
                style={{ color: 'var(--pastel-coral-dark)' }}>
                {displaySpendingCount} transactions • {filterLabel}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Income Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card
            className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer"
            style={{
              backgroundColor: 'var(--pastel-mint-light)',
            }}
            onClick={() => {
              // Navigate to dedicated income page
              router.push("/activity/income");
            }}
          >
            {/* Decorative circles */}
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full opacity-20"
              style={{ backgroundColor: 'var(--pastel-mint-dark)' }} />
            <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full opacity-15"
              style={{ backgroundColor: 'var(--pastel-mint-dark)' }} />

            <CardHeader className="pb-1 relative z-10 p-3 md:p-6">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}>
                  <TrendingUp className="h-4 w-4" style={{ color: 'var(--pastel-mint-dark)' }} />
                </div>
                <CardDescription className="font-[family-name:var(--font-dm-sans)] font-medium"
                  style={{ color: 'var(--pastel-mint-dark)' }}>
                  Income
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0 px-3 pb-3 md:px-6 md:pb-6">
              <div className="font-[family-name:var(--font-nunito)] text-2xl md:text-3xl font-black flex items-center gap-1"
                style={{ color: 'var(--text-primary)' }}>
                $<NumberTicker
                  value={displayIncome / 100}
                  decimalPlaces={2}
                  className="font-[family-name:var(--font-nunito)] font-black"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-0.5"
                style={{ color: 'var(--pastel-mint-dark)' }}>
                {filterLabel}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Active Filters Chips */}
      {activeFilters.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex flex-wrap gap-2 items-center"
        >
          <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: 'var(--text-secondary)' }}>
            Active Filters ({activeFilters.length}):
          </span>
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              className="pl-2.5 pr-1.5 py-1 rounded-full font-[family-name:var(--font-dm-sans)] text-xs cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{
                backgroundColor: 'var(--pastel-blue-light)',
                color: 'var(--pastel-blue-dark)',
                border: '1px solid var(--pastel-blue)'
              }}
              onClick={filter.onRemove}
            >
              {filter.label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs font-[family-name:var(--font-dm-sans)] h-7 px-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Clear All
          </Button>
        </motion.div>
      )}

      {/* Filters */}
      <EnhancedFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        selectedAccounts={selectedAccounts}
        setSelectedAccounts={setSelectedAccounts}
        selectedYears={selectedYears}
        setSelectedYears={setSelectedYears}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        dateRange={dateRange}
        setDateRange={setDateRange}
        minAmount={minAmount}
        setMinAmount={setMinAmount}
        maxAmount={maxAmount}
        setMaxAmount={setMaxAmount}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        includeTransfers={includeTransfers}
        setIncludeTransfers={setIncludeTransfers}
        accounts={accounts}
        categories={categories}
        availableYears={availableYears}
        onClearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
      />

      {/* Transactions List - Timeline Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{ backgroundColor: 'var(--surface-elevated)' }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-4 gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="font-[family-name:var(--font-nunito)] text-lg sm:text-xl font-bold truncate"
                style={{ color: 'var(--text-primary)' }}>
                Transactions
              </CardTitle>
              <CardDescription className="font-[family-name:var(--font-dm-sans)] text-xs sm:text-sm"
                style={{ color: 'var(--text-tertiary)' }}>
                {transactions.length} of {totalCount} transactions
              </CardDescription>
            </div>
            <ExportDialog
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-2 hover:shadow-md transition-all flex-shrink-0 px-2 sm:px-4"
                  style={{
                    borderColor: 'var(--pastel-blue)',
                    color: 'var(--pastel-blue-dark)'
                  }}
                >
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              }
            />
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {transactions.length > 0 ? (
              <>
                <div className="space-y-4 px-3 sm:px-6">
                  {/* Group transactions by date - Timeline Style */}
                  {Object.entries(
                    transactions.reduce((groups: Record<string, Transaction[]>, txn) => {
                      const date = new Date(txn.created_at);
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
                        {/* Date Divider - Centered Line Style with Daily Total */}
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
                            onSwipeLeft={() => handleDelete(txn.id)}
                            onSwipeRight={() => handleMarkAsIncome(txn.id)}
                            onShare={() => handleShare(txn.id)}
                            onNote={() => handleNote(txn)}
                          >
                            <TransactionCard
                              transaction={txn}
                              index={index}
                              onClick={() => setSelectedTransaction(txn)}
                            />
                          </SwipeableCard>
                        ))}
                      </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Load More - Softer Style */}
                {hasMore && (
                  <div ref={loadMoreRef} className="py-8 flex flex-col items-center gap-2">
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
                        Load Previous Week
                      </Button>
                    )}
                    <span className="font-[family-name:var(--font-dm-sans)] text-xs" style={{ color: 'var(--text-muted)' }}>
                      {transactions.length} of {totalCount} transactions
                    </span>
                  </div>
                )}

                {/* Loading skeletons during initial fetch */}
                {loading && transactions.length === 0 && (
                  <TransactionSkeletonList count={5} />
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className="text-7xl mb-4">📭</div>
                <p className="font-[family-name:var(--font-nunito)] font-bold text-lg mb-2"
                  style={{ color: 'var(--text-primary)' }}>
                  No transactions found
                </p>
                <p className="font-[family-name:var(--font-dm-sans)]"
                  style={{ color: 'var(--text-tertiary)' }}>
                  Try adjusting your filters
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}
