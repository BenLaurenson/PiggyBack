"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { convertIncomeFrequency } from "@/lib/income-frequency-converter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,

  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  GitBranch,
  ExternalLink,
  Maximize2,
  CalendarRange,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  Legend,
  PieChart as RechartsPieChart,
  Pie,
  Sankey,
  Layer,
  Rectangle,
} from "recharts";

interface Transaction {
  amount_cents: number;
  category_id: string | null;
  settled_at: string;
}

interface IncomeTransaction {
  amount_cents: number;
  category_id: string | null;
  settled_at: string;
  description: string | null;
  is_income: boolean | null;
}

interface CategoryMapping {
  upCategoryId: string;
  newParentName: string;
  newChildName: string;
  icon: string;
}

interface CategoryData {
  name: string;
  icon: string;
  assigned: number;
  spent: number;
}

interface IncomeSource {
  id: string;
  name: string;
  amount_cents: number;
  frequency?: string;
}

interface SubcategoryData {
  name: string;
  parentName: string;
  icon: string;
  assigned: number;
  spent: number;
}

interface NetWorthSnapshot {
  snapshot_date: string;
  total_balance_cents: number;
  investment_total_cents: number | null;
}

interface BudgetAnalysisDashboardProps {
  allTransactions: Transaction[];
  incomeTransactions?: IncomeTransaction[];
  categories: CategoryData[];
  subcategories?: SubcategoryData[];
  categoryMappings: CategoryMapping[];
  incomeSources?: IncomeSource[];
  partnerIncomeSources?: IncomeSource[];
  netWorthSnapshots?: NetWorthSnapshot[];
}

type TimeRange = 1 | 3 | 6 | 12 | "all";

const CHART_IDS = {
  SPENDING_TREND: "spending-trend",
  CATEGORY_BREAKDOWN: "category-breakdown",
  INCOME_VS_EXPENSES: "income-vs-expenses",
  MONEY_FLOW: "money-flow",
  CATEGORY_ANALYSIS: "category-analysis",
} as const;

// Pastel colors for categories
const CATEGORY_COLORS = [
  "var(--pastel-coral)",
  "var(--pastel-blue)",
  "var(--pastel-mint)",
  "var(--pastel-yellow)",
  "var(--pastel-lavender)",
  "#FFB5A7", // salmon
  "#A8DADC", // teal
  "#FEC89A", // peach
  "#B8E0D2", // sage
  "#D8B4FE", // purple
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(cents) / 100);
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function BudgetAnalysisDashboard({
  allTransactions,
  incomeTransactions = [],
  categories,
  subcategories = [],
  categoryMappings,
  incomeSources = [],
  partnerIncomeSources = [],
  netWorthSnapshots = [],
}: BudgetAnalysisDashboardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = useState<TimeRange>(6);
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [fullscreenChartId, setFullscreenChartId] = useState<string | null>(null);
  const isCustomRange = !!(customDateRange.from && customDateRange.to);

  // Navigation helpers - navigate to activity pages
  const navigateToCategory = (categoryName: string) => {
    // Convert category name to URL slug (e.g., "Food & Dining" -> "food-and-dining")
    const slug = categoryName.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-');
    router.push(`/activity/${slug}?from=analysis`);
  };

  const navigateToSubcategory = (subcategoryName: string, parentName: string) => {
    const parentSlug = parentName.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-');
    const subSlug = subcategoryName.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-');
    router.push(`/activity/${parentSlug}/${subSlug}?from=analysis`);
  };

  const navigateToIncomeSource = (sourceName: string) => {
    // For income sources, navigate to merchant history page
    const slug = encodeURIComponent(sourceName);
    router.push(`/activity/merchant/${slug}?from=analysis`);
  };

  // Calculate date boundaries for selected time range (or custom range)
  const { startDate, endDate, prevStartDate, prevEndDate, effectiveMonths } = useMemo(() => {
    let start: Date;
    let end: Date;
    let months: number;

    if (isCustomRange && customDateRange.from && customDateRange.to) {
      start = new Date(customDateRange.from.getFullYear(), customDateRange.from.getMonth(), 1);
      end = new Date(customDateRange.to.getFullYear(), customDateRange.to.getMonth() + 1, 0);
      months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
    } else if (timeRange === "all") {
      // Use full range of ALL available transactions (spending + income)
      const now = new Date();
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const allDates = [
        ...allTransactions.map((t) => new Date(t.settled_at).getTime()),
        ...incomeTransactions.map((t) => new Date(t.settled_at).getTime()),
      ];
      if (allDates.length > 0) {
        const earliest = new Date(Math.min(...allDates));
        start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
      } else {
        start = new Date(now.getFullYear(), now.getMonth() - 23, 1); // Fallback 24 months
      }
      months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
    } else {
      const now = new Date();
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      start = new Date(now.getFullYear(), now.getMonth() - timeRange + 1, 1);
      months = timeRange;
    }

    // Previous period for comparison (same duration before start)
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth() - months + 1, 1);

    return { startDate: start, endDate: end, prevStartDate: prevStart, prevEndDate: prevEnd, effectiveMonths: months };
  }, [timeRange, isCustomRange, customDateRange, allTransactions, incomeTransactions]);

  // Filter transactions for current period
  const currentTransactions = useMemo(() => {
    return allTransactions.filter((txn) => {
      const txnDate = new Date(txn.settled_at);
      return txnDate >= startDate && txnDate <= endDate;
    });
  }, [allTransactions, startDate, endDate]);

  // Filter transactions for previous period (for comparison)
  const previousTransactions = useMemo(() => {
    return allTransactions.filter((txn) => {
      const txnDate = new Date(txn.settled_at);
      return txnDate >= prevStartDate && txnDate <= prevEndDate;
    });
  }, [allTransactions, prevStartDate, prevEndDate]);

  // Helper to get parent category name from category_id
  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return "Miscellaneous";
    const mapping = categoryMappings.find((m) => m.upCategoryId === categoryId);
    return mapping?.newParentName || "Miscellaneous";
  };

  // Helper to get subcategory name from category_id
  const getSubcategoryName = (categoryId: string | null): string => {
    if (!categoryId) return "Uncategorized";
    const mapping = categoryMappings.find((m) => m.upCategoryId === categoryId);
    return mapping?.newChildName || mapping?.newParentName || "Uncategorized";
  };

  // Filter income transactions for the current period
  const currentIncomeInPeriod = useMemo(() => {
    return incomeTransactions.filter((txn) => {
      const txnDate = new Date(txn.settled_at);
      return txnDate >= startDate && txnDate <= endDate;
    });
  }, [incomeTransactions, startDate, endDate]);

  // Calculate monthly totals for line chart (using actual positive transactions for income)
  const monthlyData = useMemo(() => {
    const months: Record<string, { spending: number; income: number }> = {};

    // Initialize all months in range
    const current = new Date(startDate);
    while (current <= endDate) {
      const key = getMonthKey(current);
      months[key] = { spending: 0, income: 0 };
      current.setMonth(current.getMonth() + 1);
    }

    // Sum spending by month
    currentTransactions.forEach((txn) => {
      const key = getMonthKey(new Date(txn.settled_at));
      if (months[key]) {
        months[key].spending += Math.abs(txn.amount_cents);
      }
    });

    // Sum actual income transactions by month
    currentIncomeInPeriod.forEach((txn) => {
      const key = getMonthKey(new Date(txn.settled_at));
      if (months[key]) {
        months[key].income += txn.amount_cents;
      }
    });

    // Convert to array sorted by date
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        month: getMonthLabel(new Date(key + "-01")),
        spending: data.spending,
        income: data.income,
        savings: data.income - data.spending,
      }));
  }, [currentTransactions, currentIncomeInPeriod, startDate, endDate]);

  // Calculate category breakdown for donut chart
  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};

    currentTransactions.forEach((txn) => {
      const category = getCategoryName(txn.category_id);
      totals[category] = (totals[category] || 0) + Math.abs(txn.amount_cents);
    });

    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8) // Top 8 categories
      .map(([name, value], idx) => ({
        name,
        value,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
        icon: categories.find((c) => c.name === name)?.icon || "📁",
      }));
  }, [currentTransactions, categories, categoryMappings]);

  // Filter income transactions for the selected time range
  // Also exclude internal transfers that don't have transfer_account_id set
  const currentIncomeTransactions = useMemo(() => {
    // Patterns that indicate internal transfers (not real income)
    const transferPatterns = [
      /transfer\s*(from|to|between)/i,
      /^transfer$/i,
      /internal\s*transfer/i,
      /account\s*transfer/i,
      /spending\s*account/i,
      /expenses\s*account/i,
      /savings\s*account/i,
      /^\s*cover\s+/i,  // "Cover from X" transfers
    ];

    return incomeTransactions.filter((txn) => {
      const txnDate = new Date(txn.settled_at);
      const inDateRange = txnDate >= startDate && txnDate <= endDate;

      if (!inDateRange) return false;

      // Check if description matches any transfer pattern
      const description = txn.description || "";
      const isTransfer = transferPatterns.some(pattern => pattern.test(description));

      return !isTransfer;
    });
  }, [incomeTransactions, startDate, endDate]);

  // Calculate Sankey diagram data using ACTUAL income transactions
  const sankeyData = useMemo(() => {
    const nodes: Array<{ name: string }> = [];
    const links: Array<{ source: number; target: number; value: number }> = [];

    // Group actual income transactions by description (income source name)
    const incomeBySource: Record<string, number> = {};
    currentIncomeTransactions.forEach((txn) => {
      // Extract a clean income source name from description
      let sourceName = txn.description || "Other Income";
      // Clean up common patterns: remove dates, reference numbers, etc.
      sourceName = sourceName.replace(/\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/g, "").trim();
      // Take first meaningful part (often company name)
      const parts = sourceName.split(/[-–—]/).filter(p => p.trim().length > 2);
      if (parts.length > 0) {
        sourceName = parts[0].trim();
      }
      // Truncate very long names
      if (sourceName.length > 25) {
        sourceName = sourceName.substring(0, 22) + "...";
      }
      incomeBySource[sourceName] = (incomeBySource[sourceName] || 0) + txn.amount_cents;
    });

    // Sort income sources by amount and take top ones
    const sortedIncomeSources = Object.entries(incomeBySource)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6); // Top 6 income sources

    // Add income source nodes (level 0)
    const incomeSourceIndices: Record<string, number> = {};
    sortedIncomeSources.forEach(([name]) => {
      incomeSourceIndices[name] = nodes.length;
      nodes.push({ name });
    });

    // If there are too many small income sources, group them
    const totalActualIncome = Object.values(incomeBySource).reduce((sum, val) => sum + val, 0);
    const topSourcesTotal = sortedIncomeSources.reduce((sum, [, val]) => sum + val, 0);
    const otherIncome = totalActualIncome - topSourcesTotal;
    if (otherIncome > 0) {
      incomeSourceIndices["Other Income"] = nodes.length;
      nodes.push({ name: "Other Income" });
    }

    // Add "Total Income" node (level 1)
    const totalIncomeIndex = nodes.length;
    nodes.push({ name: "Total Income" });

    // Get spending by category
    const spendingByCategory: Record<string, number> = {};
    currentTransactions.forEach((txn) => {
      const category = getCategoryName(txn.category_id);
      spendingByCategory[category] = (spendingByCategory[category] || 0) + Math.abs(txn.amount_cents);
    });

    // Sort categories by spending and take top ones (level 2)
    const sortedCategories = Object.entries(spendingByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    // Add category nodes
    const categoryIndices: Record<string, number> = {};
    sortedCategories.forEach(([name]) => {
      categoryIndices[name] = nodes.length;
      nodes.push({ name });
    });

    // Add Savings node if there are savings
    const totalSpending = sortedCategories.reduce((sum, [, value]) => sum + value, 0);
    const savings = Math.max(0, totalActualIncome - totalSpending);

    let savingsIndex = -1;
    if (savings > 0) {
      savingsIndex = nodes.length;
      nodes.push({ name: "Savings" });
    }

    // Build links: Income Sources → Total Income
    sortedIncomeSources.forEach(([name, value]) => {
      if (value > 0) {
        links.push({
          source: incomeSourceIndices[name],
          target: totalIncomeIndex,
          value: Math.round(value / 100), // Convert to dollars
        });
      }
    });

    // Add "Other Income" link if needed
    if (otherIncome > 0) {
      links.push({
        source: incomeSourceIndices["Other Income"],
        target: totalIncomeIndex,
        value: Math.round(otherIncome / 100),
      });
    }

    // Build links: Total Income → Categories
    sortedCategories.forEach(([name, value]) => {
      if (value > 0) {
        links.push({
          source: totalIncomeIndex,
          target: categoryIndices[name],
          value: Math.round(value / 100),
        });
      }
    });

    // Add savings link if positive
    if (savings > 0 && savingsIndex >= 0) {
      links.push({
        source: totalIncomeIndex,
        target: savingsIndex,
        value: Math.round(savings / 100),
      });
    }

    // If no income transactions, return empty
    if (currentIncomeTransactions.length === 0) {
      return { nodes: [], links: [] };
    }

    return { nodes, links };
  }, [currentTransactions, currentIncomeTransactions, categoryMappings]);

  // Key metrics calculations (using account balance + configured income sources)
  const metrics = useMemo(() => {
    const totalSpending = currentTransactions.reduce((sum, txn) => sum + Math.abs(txn.amount_cents), 0);
    const prevTotalSpending = previousTransactions.reduce((sum, txn) => sum + Math.abs(txn.amount_cents), 0);
    const avgMonthly = totalSpending / effectiveMonths;
    const spendingChange = prevTotalSpending > 0 ? ((totalSpending - prevTotalSpending) / prevTotalSpending) * 100 : 0;

    // --- Net savings from account balance delta ---
    const snapshotsInRange = netWorthSnapshots.filter((s) => {
      const d = new Date(s.snapshot_date);
      return d >= startDate && d <= endDate;
    });

    let netSavings: number | null = null;
    let savingsSource: "balance" | "income_sources" | "transactions" = "transactions";

    if (snapshotsInRange.length >= 2) {
      const first = snapshotsInRange[0];
      const last = snapshotsInRange[snapshotsInRange.length - 1];
      const startBalance = first.total_balance_cents + (first.investment_total_cents || 0);
      const endBalance = last.total_balance_cents + (last.investment_total_cents || 0);
      netSavings = endBalance - startBalance;
      savingsSource = "balance";
    }

    // --- Expected income from configured income sources ---
    // Only use user's own income for savings rate since spending is from user's accounts only.
    // Partner income would inflate the estimate because partner spending isn't tracked here.
    let expectedIncomeForPeriod = 0;

    if (incomeSources.length > 0) {
      const monthlyIncome = incomeSources.reduce((sum, source) => {
        const freq = (source.frequency || "monthly") as "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
        return sum + convertIncomeFrequency(source.amount_cents, freq, "monthly");
      }, 0);
      expectedIncomeForPeriod = monthlyIncome * effectiveMonths;
    }

    // --- Savings rate: 3-tier fallback ---
    let savingsRate: number;

    if (netSavings !== null && expectedIncomeForPeriod > 0) {
      // Tier 1: balance delta / expected income
      savingsRate = (netSavings / expectedIncomeForPeriod) * 100;
    } else if (expectedIncomeForPeriod > 0) {
      // Tier 2: no snapshots, use income sources - spending
      netSavings = expectedIncomeForPeriod - totalSpending;
      savingsRate = (netSavings / expectedIncomeForPeriod) * 100;
      savingsSource = "income_sources";
    } else {
      // Tier 3: no income sources, use transfer-filtered transactions
      const filteredIncome = currentIncomeTransactions.reduce((sum, txn) => sum + txn.amount_cents, 0);
      netSavings = filteredIncome - totalSpending;
      savingsRate = filteredIncome > 0 ? ((filteredIncome - totalSpending) / filteredIncome) * 100 : 0;
    }

    return {
      totalSpending,
      avgMonthly,
      savingsRate,
      spendingChange,
      totalIncome: expectedIncomeForPeriod,
      netSavings: netSavings ?? 0,
      savingsSource,
    };
  }, [currentTransactions, previousTransactions, currentIncomeTransactions, effectiveMonths, netWorthSnapshots, startDate, endDate, incomeSources, partnerIncomeSources]);

  // Category analysis table data (subcategory-level)
  const categoryAnalysis = useMemo(() => {
    const currentTotals: Record<string, number> = {};
    const prevTotals: Record<string, number> = {};

    currentTransactions.forEach((txn) => {
      const subcat = getSubcategoryName(txn.category_id);
      currentTotals[subcat] = (currentTotals[subcat] || 0) + Math.abs(txn.amount_cents);
    });

    previousTransactions.forEach((txn) => {
      const subcat = getSubcategoryName(txn.category_id);
      prevTotals[subcat] = (prevTotals[subcat] || 0) + Math.abs(txn.amount_cents);
    });

    const totalSpending = Object.values(currentTotals).reduce((a, b) => a + b, 0);
    const hasPreviousData = previousTransactions.length > 0;

    return Object.entries(currentTotals)
      .map(([name, total]) => {
        const prevTotal = prevTotals[name] || 0;
        // If there's no previous data at all, mark as null (no trend to show)
        // If there's previous data but this subcategory is new, show as "new"
        let change: number | null;
        if (!hasPreviousData) {
          change = null;
        } else if (prevTotal === 0) {
          change = total > 0 ? Infinity : 0; // "New" indicator
        } else {
          change = ((total - prevTotal) / prevTotal) * 100;
        }

        const subcategory = subcategories.find((s) => s.name === name);

        return {
          name,
          parentName: subcategory?.parentName || name,
          icon: subcategory?.icon || "📁",
          total,
          avgMonthly: total / effectiveMonths,
          percentOfTotal: totalSpending > 0 ? (total / totalSpending) * 100 : 0,
          change,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [currentTransactions, previousTransactions, subcategories, effectiveMonths, categoryMappings]);

  // Chart title map for modal header
  const chartTitles: Record<string, string> = {
    [CHART_IDS.SPENDING_TREND]: "Monthly Spending Trend",
    [CHART_IDS.CATEGORY_BREAKDOWN]: "Spending by Category",
    [CHART_IDS.INCOME_VS_EXPENSES]: "Income vs Expenses",
    [CHART_IDS.MONEY_FLOW]: "Money Flow",
    [CHART_IDS.CATEGORY_ANALYSIS]: "Category Analysis",
  };

  const handleSelectMonth = useCallback((date: Date) => {
    if (!customDateRange.from || (customDateRange.from && customDateRange.to)) {
      // Start new selection
      setCustomDateRange({ from: date, to: undefined });
    } else {
      // Complete the range
      const from = customDateRange.from;
      if (date < from) {
        setCustomDateRange({ from: date, to: from });
      } else {
        setCustomDateRange({ from, to: date });
      }
      setShowDatePicker(false);
    }
  }, [customDateRange]);

  const clearCustomRange = useCallback(() => {
    setCustomDateRange({});
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-end flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div
            className="inline-flex rounded-xl p-1"
            style={{ background: "var(--muted)" }}
          >
            {([1, 3, 6, 12, "all"] as TimeRange[]).map((range) => (
              <Button
                key={String(range)}
                variant="ghost"
                size="sm"
                onClick={() => { setTimeRange(range); clearCustomRange(); }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all cursor-pointer ${
                  timeRange === range && !isCustomRange ? "shadow-sm" : ""
                }`}
                style={{
                  background: timeRange === range && !isCustomRange ? "var(--card)" : "transparent",
                  color: timeRange === range && !isCustomRange ? "var(--pastel-blue-dark)" : "var(--text-secondary)",
                }}
              >
                {range === "all" ? "All" : `${range}M`}
              </Button>
            ))}
          </div>
          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`rounded-lg px-3 py-1.5 h-auto gap-1.5 cursor-pointer ${isCustomRange ? "shadow-sm" : ""}`}
                style={{
                  borderColor: isCustomRange ? "var(--pastel-blue-dark)" : "var(--border)",
                  background: isCustomRange ? "var(--pastel-blue-light)" : "transparent",
                  color: isCustomRange ? "var(--pastel-blue-dark)" : "var(--text-secondary)",
                }}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="text-sm font-medium">
                  {isCustomRange
                    ? `${customDateRange.from!.toLocaleDateString("en-AU", { month: "short", year: "2-digit" })} – ${customDateRange.to!.toLocaleDateString("en-AU", { month: "short", year: "2-digit" })}`
                    : "Custom"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="end">
              <MonthRangePicker
                from={customDateRange.from}
                to={customDateRange.to}
                onSelectMonth={handleSelectMonth}
                onClear={() => { clearCustomRange(); setShowDatePicker(false); }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          title="Total Spending"
          value={formatCurrency(metrics.totalSpending)}
          subtitle={`${effectiveMonths} month${effectiveMonths > 1 ? "s" : ""}`}
          icon={<DollarSign className="h-5 w-5" />}
          color="coral"
        />
        <MetricCard
          title="Monthly Average"
          value={formatCurrency(metrics.avgMonthly)}
          subtitle="per month"
          icon={<BarChart3 className="h-5 w-5" />}
          color="blue"
        />
        <MetricCard
          title="Savings Rate"
          value={`${metrics.savingsRate.toFixed(1)}%`}
          subtitle={
            formatCurrency(metrics.netSavings) +
            (metrics.netSavings >= 0 ? " saved" : " deficit") +
            (metrics.savingsSource === "balance" ? "" : metrics.savingsSource === "income_sources" ? " (est. from income)" : "")
          }
          icon={<PiggyBank className="h-5 w-5" />}
          color="mint"
          trend={metrics.savingsRate >= 20 ? "good" : metrics.savingsRate >= 10 ? "neutral" : "bad"}
        />
        <MetricCard
          title="vs Last Period"
          value={`${metrics.spendingChange >= 0 ? "+" : ""}${metrics.spendingChange.toFixed(1)}%`}
          subtitle={metrics.spendingChange <= 0 ? "spending down" : "spending up"}
          icon={metrics.spendingChange <= 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
          color={metrics.spendingChange <= 0 ? "mint" : "coral"}
          trend={metrics.spendingChange <= 0 ? "good" : "bad"}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Spending Trend */}
        <Card className="border rounded-2xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color: "var(--pastel-blue-dark)" }} />
                Monthly Spending Trend
              </span>
              <ExpandButton chartId={CHART_IDS.SPENDING_TREND} onClick={setFullscreenChartId} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }}
                    tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                    width={50}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="spending"
                    stroke="var(--pastel-coral)"
                    strokeWidth={3}
                    dot={{ fill: "var(--pastel-coral)", r: 4 }}
                    name="Spending"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown Donut */}
        <Card className="border rounded-2xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <PieChart className="h-4 w-4" style={{ color: "var(--pastel-lavender-dark)" }} />
                Spending by Category
              </span>
              <ExpandButton chartId={CHART_IDS.CATEGORY_BREAKDOWN} onClick={setFullscreenChartId} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(data) => {
                      if (data?.name) {
                        navigateToCategory(data.name);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} style={{ cursor: "pointer" }} />
                    ))}
                  </Pie>
                  <Tooltip content={<CategoryTooltip />} />
                </RechartsPieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div
                    className="font-[family-name:var(--font-nunito)] text-xl font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {categoryData.length}
                  </div>
                  <div
                    className="font-[family-name:var(--font-dm-sans)] text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    categories
                  </div>
                </div>
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {categoryData.slice(0, 5).map((cat) => (
                <button
                  key={cat.name}
                  className="flex items-center gap-1 hover:opacity-70 transition-opacity cursor-pointer"
                  onClick={() => navigateToCategory(cat.name)}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="font-[family-name:var(--font-dm-sans)] text-xs" style={{ color: "var(--text-secondary)" }}>
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Income vs Expenses */}
        <Card className="border rounded-2xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color: "var(--pastel-yellow-dark)" }} />
                Income vs Expenses
              </span>
              <ExpandButton chartId={CHART_IDS.INCOME_VS_EXPENSES} onClick={setFullscreenChartId} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--pastel-mint)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--pastel-mint)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--pastel-coral)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--pastel-coral)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }}
                    tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                    width={50}
                  />
                  <Tooltip content={<IncomeExpenseTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "var(--font-dm-sans)" }} />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="var(--pastel-mint-dark)"
                    fill="url(#incomeGradient)"
                    strokeWidth={2}
                    name="Income"
                  />
                  <Area
                    type="monotone"
                    dataKey="spending"
                    stroke="var(--pastel-coral-dark)"
                    fill="url(#expenseGradient)"
                    strokeWidth={2}
                    name="Spending"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Money Flow Sankey Diagram */}
      <Card className="border rounded-2xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <CardHeader className="pb-2">
          <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" style={{ color: "var(--pastel-mint-dark)" }} />
              Money Flow
            </span>
            <ExpandButton chartId={CHART_IDS.MONEY_FLOW} onClick={setFullscreenChartId} />
          </CardTitle>
          <p
            className="font-[family-name:var(--font-dm-sans)] text-xs mt-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            How your income sources flow into spending categories over the last {effectiveMonths} months
          </p>
        </CardHeader>
        <CardContent>
          {sankeyData.nodes && sankeyData.nodes.length > 0 ? (
            <div className={isMobile ? "h-[400px]" : "h-[500px]"}>
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={sankeyData}
                  nodeWidth={isMobile ? 10 : 15}
                  nodePadding={isMobile ? 24 : 40}
                  linkCurvature={0.5}
                  iterations={32}
                  margin={isMobile
                    ? { top: 10, right: 110, bottom: 10, left: 0 }
                    : { top: 20, right: 200, bottom: 20, left: 20 }
                  }
                  node={(props: any) => {
                    const { x, y, width, height, index, payload } = props;
                    const name = payload?.name || "";
                    const isTotalIncome = name === "Total Income";
                    const isSavings = name === "Savings";

                    // Find Total Income node index to determine if this is an income source
                    const totalIncomeNodeIndex = sankeyData.nodes.findIndex(
                      (n: { name: string }) => n.name === "Total Income"
                    );
                    const isIncomeSource = index < totalIncomeNodeIndex;

                    // Color scheme
                    let fill = "#94A3B8"; // Default gray for categories
                    if (isTotalIncome) {
                      fill = "#34D399"; // Darker green for total income
                    } else if (isSavings) {
                      fill = "#FCD34D"; // Yellow for savings
                    } else if (isIncomeSource) {
                      // Different shades of green for income sources
                      const incomeColors = [
                        "#6EE7B7", // Mint
                        "#86EFAC", // Light green
                        "#4ADE80", // Green
                        "#A7F3D0", // Pale mint
                        "#34D399", // Emerald
                        "#10B981", // Teal
                      ];
                      fill = incomeColors[index % incomeColors.length];
                    } else {
                      // Category colors - vibrant pastels
                      const categoryColors = [
                        "#F9A8D4", // Pink
                        "#93C5FD", // Blue
                        "#FCA5A5", // Coral
                        "#A5B4FC", // Indigo
                        "#FDBA74", // Orange
                        "#C4B5FD", // Purple
                        "#67E8F9", // Cyan
                        "#FDE68A", // Yellow
                      ];
                      const catIndex = index - totalIncomeNodeIndex - 1;
                      fill = categoryColors[catIndex % categoryColors.length];
                    }

                    // Determine if this node is clickable
                    const isClickable = !isTotalIncome && !isSavings;
                    const handleNodeClick = () => {
                      if (!isClickable) return;
                      if (isIncomeSource) {
                        navigateToIncomeSource(name);
                      } else {
                        // Category node - navigate to category
                        navigateToCategory(name);
                      }
                    };

                    // Truncate labels on mobile
                    const maxLabelLen = isMobile ? 14 : 999;
                    const displayName = name.length > maxLabelLen
                      ? name.slice(0, maxLabelLen - 1) + "…"
                      : name;
                    const labelFontSize = isMobile ? "10px" : "12px";
                    const valueFontSize = isMobile ? "8px" : "10px";
                    const valueYOffset = isMobile ? 12 : 14;

                    return (
                      <Layer key={`node-${index}`}>
                        <Rectangle
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={fill}
                          fillOpacity={0.9}
                          rx={4}
                          ry={4}
                          style={{ cursor: isClickable ? "pointer" : "default" }}
                          onClick={handleNodeClick}
                        />
                        <text
                          x={x + width + 6}
                          y={y + height / 2}
                          textAnchor="start"
                          dominantBaseline="middle"
                          style={{
                            fontSize: labelFontSize,
                            fontFamily: "var(--font-dm-sans)",
                            fontWeight: isTotalIncome ? 700 : 500,
                            fill: "var(--text-primary)",
                            cursor: isClickable ? "pointer" : "default",
                          }}
                          onClick={handleNodeClick}
                        >
                          {displayName}
                          {isClickable && !isMobile && (
                            <tspan dx={4} style={{ fontSize: "10px", fill: "var(--text-tertiary)" }}>↗</tspan>
                          )}
                        </text>
                        <text
                          x={x + width + 6}
                          y={y + height / 2 + valueYOffset}
                          textAnchor="start"
                          dominantBaseline="middle"
                          style={{
                            fontSize: valueFontSize,
                            fontFamily: "var(--font-dm-sans)",
                            fill: "var(--text-tertiary)",
                            cursor: isClickable ? "pointer" : "default",
                          }}
                          onClick={handleNodeClick}
                        >
                          {formatCurrency(payload?.value * 100 || 0)}
                        </text>
                      </Layer>
                    );
                  }}
                  link={(props: any) => {
                    const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth } = props;
                    // Gradient color based on source
                    const gradientId = `gradient-${props.index}`;

                    return (
                      <Layer key={`link-${props.index}`}>
                        <defs>
                          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#6EE7B7" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#93C5FD" stopOpacity={0.5} />
                          </linearGradient>
                        </defs>
                        <path
                          d={`
                            M${sourceX},${sourceY}
                            C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
                          `}
                          fill="none"
                          stroke={`url(#${gradientId})`}
                          strokeWidth={Math.max(linkWidth, 2)}
                          strokeOpacity={0.6}
                        />
                      </Layer>
                    );
                  }}
                >
                  <Tooltip
                    content={({ payload }: any) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div
                            className="bg-white/95 backdrop-blur-sm border rounded-xl p-3 shadow-lg"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <p
                              className="font-[family-name:var(--font-nunito)] font-bold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {data.name}
                            </p>
                            <p
                              className="font-[family-name:var(--font-dm-sans)] text-sm"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {formatCurrency(data.value * 100)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center">
              <p
                className="font-[family-name:var(--font-dm-sans)] text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                No income transactions found for this period
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Analysis Table */}
      <Card className="border rounded-2xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <CardHeader className="pb-2">
          <CardTitle className="font-[family-name:var(--font-nunito)] text-base font-bold flex items-center gap-2 justify-between">
            <span>Category Analysis</span>
            <ExpandButton chartId={CHART_IDS.CATEGORY_ANALYSIS} onClick={setFullscreenChartId} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="text-left py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>
                    Category
                  </th>
                  <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>
                    Total
                  </th>
                  <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase hidden sm:table-cell" style={{ color: "var(--text-tertiary)" }}>
                    Monthly Avg
                  </th>
                  <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase hidden md:table-cell" style={{ color: "var(--text-tertiary)" }}>
                    % of Total
                  </th>
                  <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryAnalysis.slice(0, 10).map((cat, idx) => (
                  <motion.tr
                    key={cat.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-b last:border-b-0 hover:bg-[var(--muted)]/50 transition-colors cursor-pointer group"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => navigateToSubcategory(cat.name, cat.parentName)}
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cat.icon}</span>
                        <div className="flex flex-col">
                          <span className="font-[family-name:var(--font-nunito)] text-sm font-semibold group-hover:underline" style={{ color: "var(--text-primary)" }}>
                            {cat.name}
                          </span>
                          <span className="font-[family-name:var(--font-dm-sans)] text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            {cat.parentName}
                          </span>
                        </div>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" style={{ color: "var(--text-tertiary)" }} />
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span className="font-[family-name:var(--font-dm-sans)] text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {formatCurrency(cat.total)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right hidden sm:table-cell">
                      <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: "var(--text-secondary)" }}>
                        {formatCurrency(cat.avgMonthly)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right hidden md:table-cell">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: "var(--pastel-blue-light)",
                          color: "var(--pastel-blue-dark)",
                        }}
                      >
                        {cat.percentOfTotal.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <TrendIndicator change={cat.change} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Fullscreen Chart Modal */}
      <Dialog open={!!fullscreenChartId} onOpenChange={(open) => { if (!open) setFullscreenChartId(null); }}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-nunito)] text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {fullscreenChartId ? chartTitles[fullscreenChartId] || "Chart" : "Chart"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {fullscreenChartId === CHART_IDS.SPENDING_TREND && (
              <div className="h-[70vh]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }} />
                    <YAxis tick={{ fontSize: 12, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="spending" stroke="var(--pastel-coral)" strokeWidth={3} dot={{ fill: "var(--pastel-coral)", r: 5 }} name="Spending" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {fullscreenChartId === CHART_IDS.CATEGORY_BREAKDOWN && (
              <div className="h-[70vh] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius="35%" outerRadius="55%" paddingAngle={2} dataKey="value" onClick={(data) => { if (data?.name) navigateToCategory(data.name); }} style={{ cursor: "pointer" }}>
                      {categoryData.map((entry, index) => (<Cell key={`cell-fs-${index}`} fill={entry.color} style={{ cursor: "pointer" }} />))}
                    </Pie>
                    <Tooltip content={<CategoryTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "13px", fontFamily: "var(--font-dm-sans)" }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}

            {fullscreenChartId === CHART_IDS.INCOME_VS_EXPENSES && (
              <div className="h-[70vh]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="incomeGradientFs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--pastel-mint)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--pastel-mint)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expenseGradientFs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--pastel-coral)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--pastel-coral)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }} />
                    <YAxis tick={{ fontSize: 12, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)" }} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} width={60} />
                    <Tooltip content={<IncomeExpenseTooltip />} />
                    <Legend wrapperStyle={{ fontSize: "12px", fontFamily: "var(--font-dm-sans)" }} />
                    <Area type="monotone" dataKey="income" stroke="var(--pastel-mint-dark)" fill="url(#incomeGradientFs)" strokeWidth={2} name="Income" />
                    <Area type="monotone" dataKey="spending" stroke="var(--pastel-coral-dark)" fill="url(#expenseGradientFs)" strokeWidth={2} name="Spending" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {fullscreenChartId === CHART_IDS.MONEY_FLOW && (
              sankeyData.nodes && sankeyData.nodes.length > 0 ? (
                <div className="h-[70vh]">
                  <ResponsiveContainer width="100%" height="100%">
                    <Sankey
                      data={sankeyData}
                      nodeWidth={isMobile ? 10 : 15}
                      nodePadding={isMobile ? 24 : 40}
                      linkCurvature={0.5}
                      iterations={32}
                      margin={isMobile
                        ? { top: 10, right: 110, bottom: 10, left: 0 }
                        : { top: 20, right: 200, bottom: 20, left: 20 }
                      }
                      node={(props: any) => {
                        const { x, y, width, height, index, payload } = props;
                        const name = payload?.name || "";
                        const isTotalIncome = name === "Total Income";
                        const isSavings = name === "Savings";
                        const totalIncomeNodeIndex = sankeyData.nodes.findIndex((n: { name: string }) => n.name === "Total Income");
                        const isIncomeSource = index < totalIncomeNodeIndex;
                        let fill = "#94A3B8";
                        if (isTotalIncome) fill = "#34D399";
                        else if (isSavings) fill = "#FCD34D";
                        else if (isIncomeSource) {
                          const incomeColors = ["#6EE7B7", "#86EFAC", "#4ADE80", "#A7F3D0", "#34D399", "#10B981"];
                          fill = incomeColors[index % incomeColors.length];
                        } else {
                          const categoryColors = ["#F9A8D4", "#93C5FD", "#FCA5A5", "#A5B4FC", "#FDBA74", "#C4B5FD", "#67E8F9", "#FDE68A"];
                          fill = categoryColors[(index - totalIncomeNodeIndex - 1) % categoryColors.length];
                        }
                        const isClickable = !isTotalIncome && !isSavings;
                        const handleNodeClick = () => { if (!isClickable) return; isIncomeSource ? navigateToIncomeSource(name) : navigateToCategory(name); };
                        const fsMaxLabelLen = isMobile ? 14 : 999;
                        const fsDisplayName = name.length > fsMaxLabelLen ? name.slice(0, fsMaxLabelLen - 1) + "…" : name;
                        const fsLabelSize = isMobile ? "10px" : "12px";
                        const fsValueSize = isMobile ? "8px" : "10px";
                        const fsValueYOffset = isMobile ? 12 : 14;
                        return (
                          <Layer key={`node-fs-${index}`}>
                            <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.9} rx={4} ry={4} style={{ cursor: isClickable ? "pointer" : "default" }} onClick={handleNodeClick} />
                            <text x={x + width + 6} y={y + height / 2} textAnchor="start" dominantBaseline="middle" style={{ fontSize: fsLabelSize, fontFamily: "var(--font-dm-sans)", fontWeight: isTotalIncome ? 700 : 500, fill: "var(--text-primary)", cursor: isClickable ? "pointer" : "default" }} onClick={handleNodeClick}>
                              {fsDisplayName}{isClickable && !isMobile && <tspan dx={4} style={{ fontSize: "10px", fill: "var(--text-tertiary)" }}>↗</tspan>}
                            </text>
                            <text x={x + width + 6} y={y + height / 2 + fsValueYOffset} textAnchor="start" dominantBaseline="middle" style={{ fontSize: fsValueSize, fontFamily: "var(--font-dm-sans)", fill: "var(--text-tertiary)", cursor: isClickable ? "pointer" : "default" }} onClick={handleNodeClick}>
                              {formatCurrency(payload?.value * 100 || 0)}
                            </text>
                          </Layer>
                        );
                      }}
                      link={(props: any) => {
                        const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth } = props;
                        const gradientId = `gradient-fs-${props.index}`;
                        return (
                          <Layer key={`link-fs-${props.index}`}>
                            <defs>
                              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#6EE7B7" stopOpacity={0.5} />
                                <stop offset="100%" stopColor="#93C5FD" stopOpacity={0.5} />
                              </linearGradient>
                            </defs>
                            <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`} fill="none" stroke={`url(#${gradientId})`} strokeWidth={Math.max(linkWidth, 2)} strokeOpacity={0.6} />
                          </Layer>
                        );
                      }}
                    >
                      <Tooltip content={({ payload }: any) => {
                        if (payload && payload.length > 0) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white/95 backdrop-blur-sm border rounded-xl p-3 shadow-lg" style={{ borderColor: "var(--border)" }}>
                              <p className="font-[family-name:var(--font-nunito)] font-bold" style={{ color: "var(--text-primary)" }}>{data.name}</p>
                              <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: "var(--text-secondary)" }}>{formatCurrency(data.value * 100)}</p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                    </Sankey>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center">
                  <p className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: "var(--text-tertiary)" }}>No income transactions found for this period</p>
                </div>
              )
            )}

            {fullscreenChartId === CHART_IDS.CATEGORY_ANALYSIS && (
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0" style={{ background: "var(--card)" }}>
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <th className="text-left py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>Category</th>
                      <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>Total</th>
                      <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>Monthly Avg</th>
                      <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>% of Total</th>
                      <th className="text-right py-2 px-2 font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryAnalysis.map((cat, idx) => (
                      <motion.tr
                        key={cat.name}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className="border-b last:border-b-0 hover:bg-[var(--muted)]/50 transition-colors cursor-pointer group"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => navigateToSubcategory(cat.name, cat.parentName)}
                      >
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{cat.icon}</span>
                            <div className="flex flex-col">
                              <span className="font-[family-name:var(--font-nunito)] text-sm font-semibold group-hover:underline" style={{ color: "var(--text-primary)" }}>{cat.name}</span>
                              <span className="font-[family-name:var(--font-dm-sans)] text-[10px]" style={{ color: "var(--text-tertiary)" }}>{cat.parentName}</span>
                            </div>
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" style={{ color: "var(--text-tertiary)" }} />
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className="font-[family-name:var(--font-dm-sans)] text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(cat.total)}</span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className="font-[family-name:var(--font-dm-sans)] text-sm" style={{ color: "var(--text-secondary)" }}>{formatCurrency(cat.avgMonthly)}</span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "var(--pastel-blue-light)", color: "var(--pastel-blue-dark)" }}>{cat.percentOfTotal.toFixed(1)}%</span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <TrendIndicator change={cat.change} />
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// Month range picker for custom date selection
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthRangePicker({
  from,
  to,
  onSelectMonth,
  onClear,
}: {
  from?: Date;
  to?: Date;
  onSelectMonth: (date: Date) => void;
  onClear: () => void;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [displayYear, setDisplayYear] = useState(currentYear);

  const isSelected = (year: number, month: number) => {
    if (!from) return false;
    const date = new Date(year, month, 1);
    if (to) {
      const fromStart = new Date(from.getFullYear(), from.getMonth(), 1);
      const toStart = new Date(to.getFullYear(), to.getMonth(), 1);
      return date >= fromStart && date <= toStart;
    }
    return date.getFullYear() === from.getFullYear() && date.getMonth() === from.getMonth();
  };

  const isRangeStart = (year: number, month: number) => {
    return from && from.getFullYear() === year && from.getMonth() === month;
  };

  const isRangeEnd = (year: number, month: number) => {
    return to && to.getFullYear() === year && to.getMonth() === month;
  };

  const isFuture = (year: number, month: number) => {
    return year > currentYear || (year === currentYear && month > now.getMonth());
  };

  return (
    <div className="w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setDisplayYear((y) => y - 1)}
          className="p-1 rounded-lg hover:bg-[var(--muted)] cursor-pointer"
        >
          <ChevronLeftIcon className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
        </button>
        <span
          className="font-[family-name:var(--font-nunito)] text-sm font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {displayYear}
        </span>
        <button
          type="button"
          onClick={() => setDisplayYear((y) => Math.min(y + 1, currentYear))}
          className="p-1 rounded-lg hover:bg-[var(--muted)] cursor-pointer"
          disabled={displayYear >= currentYear}
          style={{ opacity: displayYear >= currentYear ? 0.3 : 1 }}
        >
          <ChevronRightIcon className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MONTH_LABELS.map((label, month) => {
          const selected = isSelected(displayYear, month);
          const rangeStart = isRangeStart(displayYear, month);
          const rangeEnd = isRangeEnd(displayYear, month);
          const future = isFuture(displayYear, month);
          return (
            <button
              key={month}
              type="button"
              disabled={future}
              onClick={() => onSelectMonth(new Date(displayYear, month, 1))}
              className="rounded-lg px-2 py-2 text-center transition-colors cursor-pointer font-[family-name:var(--font-dm-sans)] text-xs font-medium"
              style={{
                background: rangeStart || rangeEnd
                  ? "var(--pastel-blue-dark)"
                  : selected
                  ? "var(--pastel-blue-light)"
                  : "transparent",
                color: rangeStart || rangeEnd
                  ? "white"
                  : selected
                  ? "var(--pastel-blue-dark)"
                  : future
                  ? "var(--text-tertiary)"
                  : "var(--text-secondary)",
                opacity: future ? 0.4 : 1,
                cursor: future ? "not-allowed" : "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {(from || to) && (
        <div className="mt-3 flex items-center justify-between">
          <span className="font-[family-name:var(--font-dm-sans)] text-xs" style={{ color: "var(--text-tertiary)" }}>
            {from && !to ? "Select end month" : from && to ? `${from.toLocaleDateString("en-AU", { month: "short", year: "numeric" })} – ${to.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}` : ""}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium cursor-pointer hover:underline"
            style={{ color: "var(--pastel-coral-dark)" }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// Expand button for chart fullscreen modal
function ExpandButton({ chartId, onClick }: { chartId: string; onClick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(chartId)}
      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)] flex-shrink-0 cursor-pointer"
      title="View fullscreen"
    >
      <Maximize2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
    </button>
  );
}

// Helper component for metric cards
function MetricCard({
  title,
  value,
  subtitle,
  icon,
  color,
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: "coral" | "blue" | "mint" | "yellow" | "lavender";
  trend?: "good" | "neutral" | "bad";
}) {
  const colors = {
    coral: { bg: "var(--pastel-coral-light)", text: "var(--pastel-coral-dark)" },
    blue: { bg: "var(--pastel-blue-light)", text: "var(--pastel-blue-dark)" },
    mint: { bg: "var(--pastel-mint-light)", text: "var(--pastel-mint-dark)" },
    yellow: { bg: "var(--pastel-yellow-light)", text: "var(--pastel-yellow-dark)" },
    lavender: { bg: "var(--pastel-lavender-light)", text: "var(--pastel-lavender-dark)" },
  };

  return (
    <Card className="border rounded-xl" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: colors[color].bg, color: colors[color].text }}
          >
            {icon}
          </div>
          {trend && (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{
                background: trend === "good" ? "var(--pastel-mint-light)" : trend === "bad" ? "var(--pastel-coral-light)" : "var(--muted)",
              }}
            >
              {trend === "good" ? (
                <ArrowUpRight className="h-3 w-3" style={{ color: "var(--pastel-mint-dark)" }} />
              ) : trend === "bad" ? (
                <ArrowDownRight className="h-3 w-3" style={{ color: "var(--pastel-coral-dark)" }} />
              ) : (
                <Minus className="h-3 w-3" style={{ color: "var(--text-tertiary)" }} />
              )}
            </div>
          )}
        </div>
        <div className="mt-3">
          <p
            className="font-[family-name:var(--font-dm-sans)] text-xs uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            {title}
          </p>
          <p
            className="font-[family-name:var(--font-nunito)] text-xl font-bold mt-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            {value}
          </p>
          <p
            className="font-[family-name:var(--font-dm-sans)] text-xs mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {subtitle}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Trend indicator component
function TrendIndicator({ change }: { change: number | null }) {
  // No previous data to compare
  if (change === null) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: "var(--muted)", color: "var(--text-tertiary)" }}
      >
        —
      </span>
    );
  }

  // New subcategory (had no spending in previous period)
  if (!isFinite(change)) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: "var(--pastel-lavender-light)", color: "var(--pastel-lavender-dark)" }}
      >
        New
      </span>
    );
  }

  if (Math.abs(change) < 1) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ background: "var(--muted)", color: "var(--text-secondary)" }}
      >
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  }

  const isDown = change < 0;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: isDown ? "var(--pastel-mint-light)" : "var(--pastel-coral-light)",
        color: isDown ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)",
      }}
    >
      {isDown ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
      {Math.abs(change).toFixed(0)}%
    </span>
  );
}

// Custom tooltip components
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-xl p-3 shadow-lg" style={{ borderColor: "var(--border)" }}>
      <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

function CategoryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-xl p-3 shadow-lg" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{data.icon}</span>
        <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: "var(--text-primary)" }}>
          {data.name}
        </p>
      </div>
      <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: data.color }}>
        {formatCurrency(data.value)}
      </p>
    </div>
  );
}

function IncomeExpenseTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p: any) => p.dataKey === "income")?.value || 0;
  const spending = payload.find((p: any) => p.dataKey === "spending")?.value || 0;
  const savings = income - spending;

  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-xl p-3 shadow-lg" style={{ borderColor: "var(--border)" }}>
      <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </p>
      <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-1" style={{ color: "var(--pastel-mint-dark)" }}>
        Income: {formatCurrency(income)}
      </p>
      <p className="font-[family-name:var(--font-dm-sans)] text-xs mt-0.5" style={{ color: "var(--pastel-coral-dark)" }}>
        Spending: {formatCurrency(spending)}
      </p>
      <p
        className="font-[family-name:var(--font-dm-sans)] text-xs mt-1 font-semibold border-t pt-1"
        style={{
          borderColor: "var(--border)",
          color: savings >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)",
        }}
      >
        {savings >= 0 ? "Saved: " : "Deficit: "}{formatCurrency(Math.abs(savings))}
      </p>
    </div>
  );
}

