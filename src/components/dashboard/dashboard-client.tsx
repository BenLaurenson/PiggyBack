"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { ChevronRight, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { PlanHealthRing } from "@/components/plan/plan-health-ring";
import { NumberTicker } from "@/components/ui/number-ticker";
import { RecurringExpensesCard } from "@/components/budget/recurring-expenses-card";
import Link from "next/link";
import type { Insight } from "@/lib/spending-insights";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ============================================================================
// Types
// ============================================================================

interface CategoryMapping {
  up_category_id: string;
  new_parent_name: string | null;
  icon: string | null;
}

interface Transaction {
  id: string;
  description: string;
  amount_cents: number;
  created_at: string;
  category_id: string | null;
  is_income: boolean | null;
}

interface TopCategory {
  categoryId: string;
  amount: number;
  name: string;
  icon: string;
}

interface UpcomingBill {
  id: string;
  name: string;
  emoji: string | null;
  amount: number;
  dueDate: string;
  isPaid: boolean;
}

interface Goal {
  id: string;
  name: string;
  icon: string;
  color: string;
  current_amount_cents: number;
  target_amount_cents: number;
  deadline: string | null;
}

interface DailySpending {
  day: number;
  amount: number;
  label: string;
}

interface MonthlyNetFlow {
  month: string;
  income: number;
  spending: number;
  net: number;
}

interface NetWorthSnapshot {
  snapshot_date: string;
  total_balance_cents: number;
  investment_total_cents?: number;
}

interface DashboardClientProps {
  userName: string;
  totalBalance: number;
  accountCount: number;
  lastSyncTime: string | null;
  monthlySpending: number;
  monthlyIncome: number;
  recentTransactions: Transaction[];
  categoryMappings: CategoryMapping[];
  topCategories: TopCategory[];
  upcomingBills: UpcomingBill[];
  recurringExpenses?: { id: string; name: string; emoji: string | null; expected_amount_cents: number; next_due_date: string; recurrence_type?: string; expense_matches?: any[] }[];
  goals: Goal[];
  daysUntilPay: number | null;
  nextPayAmount: number | null;
  dailySpending?: DailySpending[];
  monthlyNetFlow?: MonthlyNetFlow[];
  insights?: Insight[];
  netWorthSnapshots?: NetWorthSnapshot[];
  healthScore?: number;
  safeToSpend?: number | null;
  monthlyBurnRate?: number;
  yearEndProjection?: number;
}

// ============================================================================
// Utilities
// ============================================================================

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

const formatCurrencyCompact = (cents: number) => {
  const amount = Math.abs(cents / 100);
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return formatCurrency(cents);
};

const formatRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays} days`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};

const getLastSyncText = (syncTime: string | null) => {
  if (!syncTime) return null;
  const diffMs = Date.now() - new Date(syncTime).getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const goalIconMap: Record<string, string> = {
  "piggy-bank": "🐷",
  home: "🏠",
  car: "🚗",
  plane: "✈️",
  gift: "🎁",
  heart: "❤️",
  star: "⭐",
  money: "💰",
  ring: "💍",
  baby: "👶",
  vacation: "🏖️",
};

// ============================================================================
// Mini Spending Chart Component (Recharts)
// ============================================================================

function SpendingChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs"
      style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
    >
      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Day {data.day}</p>
      <p style={{ color: "var(--pastel-coral-dark)" }}>${data.amount}</p>
    </div>
  );
}

function SpendingChart({
  dailySpending,
}: {
  dailySpending: DailySpending[];
}) {
  return (
    <div className="h-36 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dailySpending} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--pastel-coral)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--pastel-coral)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip content={<SpendingChartTooltip />} cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="var(--pastel-coral)"
            strokeWidth={2}
            fill="url(#spendingGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--pastel-coral-dark)", stroke: "white", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Net Flow Bar Chart Component (Recharts)
// ============================================================================

function NetFlowChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs space-y-1"
      style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
    >
      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{data.month}</p>
      <p style={{ color: "var(--pastel-mint-dark)" }}>Income: {formatCurrency(data.income)}</p>
      <p style={{ color: "var(--pastel-coral-dark)" }}>Spending: {formatCurrency(data.spending)}</p>
      <p className="font-semibold" style={{ color: data.net >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
        Net: {data.net >= 0 ? "+" : ""}{formatCurrency(data.net)}
      </p>
    </div>
  );
}

function NetFlowChart({ data }: { data: MonthlyNetFlow[] }) {
  // Convert cents to dollars for display
  const chartData = data.map(d => ({
    ...d,
    incomeDisplay: Math.round(d.income / 100),
    spendingDisplay: Math.round(d.spending / 100),
  }));

  return (
    <div className="h-28 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          />
          <Tooltip content={<NetFlowChartTooltip />} cursor={{ fill: "var(--border)", opacity: 0.3 }} />
          <Bar dataKey="incomeDisplay" fill="var(--pastel-mint)" radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Bar dataKey="spendingDisplay" fill="var(--pastel-coral)" radius={[3, 3, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DashboardClient({
  userName,
  totalBalance,
  accountCount,
  lastSyncTime,
  monthlySpending,
  monthlyIncome,
  recentTransactions,
  categoryMappings,
  topCategories,
  upcomingBills,
  recurringExpenses = [],
  goals,
  daysUntilPay,
  nextPayAmount,
  dailySpending,
  monthlyNetFlow,
  insights = [],
  netWorthSnapshots = [],
  healthScore = 50,
  safeToSpend = null,
  monthlyBurnRate = 0,
  yearEndProjection = 0,
}: DashboardClientProps) {
  const isStale = lastSyncTime
    ? Date.now() - new Date(lastSyncTime).getTime() > 24 * 60 * 60 * 1000
    : false;

  // Toast alerts for critical insights and overdue bills
  // Removed: ephemeral toast alerts for overdue bills and critical insights.
  // These now go through the persistent notification system instead
  // (see src/lib/match-expense-transactions.ts and /api/notifications).

  const netFlow = monthlyIncome - monthlySpending;

  const chartData = dailySpending || [];

  // Helper to get category icon from mappings
  const getCategoryIcon = (categoryId: string | null) => {
    if (!categoryId) return "💳";
    const mapping = categoryMappings.find(m => m.up_category_id === categoryId);
    return mapping?.icon || "💳";
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
      <div className="p-4 md:p-6 lg:p-8">

        {/* ════════════════════════════════════════════════════════════════════
            HEADER
        ════════════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
            Welcome back, {userName}!
          </h1>
          {isStale && (
            <Link
              href="/settings/up-connection"
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: "var(--pastel-yellow-light)",
                color: "var(--pastel-yellow-dark)"
              }}
            >
              <Clock className="w-3 h-3" />
              Sync needed
            </Link>
          )}
        </motion.div>

        {/* ════════════════════════════════════════════════════════════════════
            MAIN GRID LAYOUT
        ════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

          {/* LEFT COLUMN - Pulse, Budget & Net Worth */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">

            {/* Financial Pulse */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 }}
            >
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                    Financial Pulse
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <PlanHealthRing score={healthScore} size={100} />
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                          Days Until Pay
                        </p>
                        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                          {daysUntilPay !== null ? <NumberTicker value={daysUntilPay} /> : "--"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                          Safe to Spend
                        </p>
                        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                          {safeToSpend !== null ? <>$<NumberTicker value={Math.round(safeToSpend / 100)} /></> : "--"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                          Monthly Burn
                        </p>
                        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                          $<NumberTicker value={Math.round(monthlyBurnRate / 100)} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                          Year-End Proj.
                        </p>
                        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                          $<NumberTicker value={Math.round(yearEndProjection / 100)} />
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Budget Section */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      Budget
                    </CardTitle>
                    <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      {new Date().toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <Link
                    href="/budget"
                    className="text-xs font-medium flex items-center"
                    style={{ color: "var(--pastel-blue-dark)" }}
                  >
                    View details <ChevronRight className="w-3 h-3" />
                  </Link>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Income Row */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Income</span>
                      <span className="text-sm" style={{ color: "var(--pastel-mint-dark)" }}>
                        {formatCurrency(monthlyIncome)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: "100%",
                          backgroundColor: "var(--pastel-mint)"
                        }}
                      />
                    </div>
                  </div>

                  {/* Spending Row */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Spent</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {formatCurrency(monthlySpending)}
                        </span>
                        {monthlyIncome > 0 && (
                          <span
                            className="text-xs"
                            style={{ color: netFlow >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}
                          >
                            {netFlow >= 0 ? `${formatCurrency(netFlow)} remaining` : `${formatCurrency(Math.abs(netFlow))} over`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: monthlyIncome > 0 ? `${Math.min((monthlySpending / monthlyIncome) * 100, 100)}%` : "0%",
                          backgroundColor: netFlow >= 0 ? "var(--pastel-blue)" : "var(--pastel-coral)"
                        }}
                      />
                    </div>
                  </div>

                  {/* Top Categories */}
                  {topCategories.length > 0 && (
                    <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                      <p className="text-xs font-medium mb-3" style={{ color: "var(--text-tertiary)" }}>
                        TOP SPENDING
                      </p>
                      <div className="space-y-2">
                        {topCategories.slice(0, 3).map((cat) => (
                          <div key={cat.categoryId} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{cat.icon}</span>
                              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{cat.name}</span>
                            </div>
                            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                              {formatCurrency(cat.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Net Worth Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      {formatCurrency(totalBalance)} net worth
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {netFlow >= 0 ? (
                        <TrendingUp className="w-4 h-4" style={{ color: "var(--pastel-mint-dark)" }} />
                      ) : (
                        <TrendingDown className="w-4 h-4" style={{ color: "var(--pastel-coral-dark)" }} />
                      )}
                      <span
                        className="text-sm font-medium"
                        style={{ color: netFlow >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}
                      >
                        {netFlow >= 0 ? "+" : ""}{formatCurrency(netFlow)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {accountCount} {accountCount === 1 ? "account" : "accounts"}
                    {lastSyncTime && ` · ${getLastSyncText(lastSyncTime)}`}
                  </span>
                </CardHeader>
                <CardContent>
                  {/* Net worth sparkline from snapshots */}
                  {netWorthSnapshots.length >= 2 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>NET WORTH TREND</p>
                      <div className="h-16">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={netWorthSnapshots.map(s => ({
                            date: new Date(s.snapshot_date).toLocaleDateString("en-AU", { month: "short" }),
                            value: Math.round((s.total_balance_cents + (s.investment_total_cents || 0)) / 100),
                          }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                            <defs>
                              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--pastel-mint)" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="var(--pastel-mint)" stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="value" stroke="var(--pastel-mint)" strokeWidth={2} fill="url(#nwGradient)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {monthlyNetFlow && monthlyNetFlow.length > 0 ? (
                    <NetFlowChart data={monthlyNetFlow} />
                  ) : (
                    <div className="h-28 flex items-center justify-center">
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No historical data yet</p>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--pastel-mint)" }} />
                      <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Income</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--pastel-coral)" }} />
                      <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Spending</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Goals Section */}
            {goals.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      Goals
                    </CardTitle>
                    <Link
                      href="/goals"
                      className="text-xs font-medium flex items-center"
                      style={{ color: "var(--pastel-purple-dark)" }}
                    >
                      View all <ChevronRight className="w-3 h-3" />
                    </Link>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {goals.map((goal) => {
                      const progress = Math.min((goal.current_amount_cents / goal.target_amount_cents) * 100, 100);
                      const emoji = goalIconMap[goal.icon] || "🎯";

                      return (
                        <Link href="/goals" key={goal.id}>
                          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-black/5 transition-colors">
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                              style={{ backgroundColor: `${goal.color}15` }}
                            >
                              {emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                                  {goal.name}
                                </p>
                                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  {progress.toFixed(0)}% · {formatCurrency(goal.target_amount_cents - goal.current_amount_cents)} to go
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                                  {formatCurrency(goal.current_amount_cents)}
                                </p>
                              </div>
                              <Progress value={progress} className="h-1.5 mt-2" indicatorColor={goal.color} />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* RIGHT COLUMN - Spending Chart, Transactions, Recurring */}
          <div className="space-y-4 md:space-y-6">

            {/* Spending Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      Spending
                    </CardTitle>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      {formatCurrency(monthlySpending)} this month
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <SpendingChart dailySpending={chartData} />
                </CardContent>
              </Card>
            </motion.div>

            {/* Transactions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      Transactions
                    </CardTitle>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Most recent
                    </span>
                  </div>
                  <Link
                    href="/activity"
                    className="text-xs font-medium flex items-center"
                    style={{ color: "var(--pastel-blue-dark)" }}
                  >
                    All <ChevronRight className="w-3 h-3" />
                  </Link>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {recentTransactions.slice(0, 5).map((txn) => {
                      const isIncome = txn.is_income || txn.amount_cents > 0;
                      const icon = isIncome ? "💰" : getCategoryIcon(txn.category_id);
                      const mapping = categoryMappings.find(m => m.up_category_id === txn.category_id);

                      return (
                        <div key={txn.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="text-lg">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                              {txn.description}
                            </p>
                            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                              {mapping?.new_parent_name || "Uncategorized"}
                            </p>
                          </div>
                          <p
                            className="text-sm font-semibold"
                            style={{ color: isIncome ? "var(--pastel-mint-dark)" : "var(--text-primary)" }}
                          >
                            {isIncome ? "+" : ""}{formatCurrency(txn.amount_cents)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Recurring / Bills */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <RecurringExpensesCard
                expenses={recurringExpenses}
              >
                {daysUntilPay !== null && (
                  <div className="px-4 pb-4 pt-1">
                    <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg flex-shrink-0">💰</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            Payday
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                            In {daysUntilPay} days
                          </p>
                        </div>
                      </div>
                      {nextPayAmount && (
                        <p className="text-sm font-semibold flex-shrink-0" style={{ color: "var(--pastel-mint-dark)" }}>
                          +{formatCurrency(nextPayAmount)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </RecurringExpensesCard>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
