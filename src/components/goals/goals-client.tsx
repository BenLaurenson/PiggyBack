"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import {
  Plus,
  Target,
  Calendar,
  CheckCircle2,
  TrendingUp,
  ChevronRight,
  Flame,
  Wallet,
  AlertTriangle,
  Clock,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { GoalActionsMenu } from "./goal-actions-menu";

import type { GoalDataPoint, GoalStatus, GoalStatusType } from "@/lib/goal-calculations";

// ============================================================================
// Types
// ============================================================================

interface SaverAccount {
  id: string;
  display_name: string;
  balance_cents: number;
  up_account_id: string;
}

interface Goal {
  id: string;
  name: string;
  icon: string;
  color: string;
  current_amount_cents: number;
  target_amount_cents: number;
  deadline?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  linked_account_id?: string | null;
  linked_account?: SaverAccount | SaverAccount[] | null;
}

interface BudgetAllocation {
  goalName: string;
  goalIcon: string;
  assignedCents: number;
}

interface GoalsClientProps {
  activeGoals: Goal[];
  completedGoals: Goal[];
  totalTarget: number;
  totalCurrent: number;
  saverAccounts: SaverAccount[];
  savingsHistory: GoalDataPoint[];
  currentPeriod: string;
  goalStatuses: Record<string, GoalStatus>;
  budgetAllocations: BudgetAllocation[];
  totalBudgetAllocation: number;
  currentMonth: string;
  fireOnboarded: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const PERIODS = ["1M", "3M", "6M", "1Y", "ALL"] as const;

const getGoalEmoji = (icon: string) => {
  const emojiMap: Record<string, string> = {
    "piggy-bank": "\u{1F437}",
    home: "\u{1F3E0}",
    car: "\u{1F697}",
    plane: "\u2708\uFE0F",
    gift: "\u{1F381}",
    heart: "\u2764\uFE0F",
    star: "\u2B50",
    money: "\u{1F4B0}",
    ring: "\u{1F48D}",
    baby: "\u{1F476}",
  };
  return emojiMap[icon] || "\u{1F3AF}";
};

const STATUS_CONFIG: Record<
  GoalStatusType,
  { label: string; color: string; bgColor: string; icon: typeof TrendingUp }
> = {
  "on-track": {
    label: "On Track",
    color: "var(--pastel-mint-dark)",
    bgColor: "var(--pastel-mint-light)",
    icon: TrendingUp,
  },
  ahead: {
    label: "Ahead",
    color: "var(--pastel-mint-dark)",
    bgColor: "var(--pastel-mint-light)",
    icon: Zap,
  },
  behind: {
    label: "Behind",
    color: "var(--pastel-yellow-dark)",
    bgColor: "var(--pastel-yellow-light)",
    icon: AlertTriangle,
  },
  overdue: {
    label: "Overdue",
    color: "var(--pastel-coral-dark)",
    bgColor: "var(--pastel-coral-light)",
    icon: AlertTriangle,
  },
  "no-deadline": {
    label: "Open",
    color: "var(--text-tertiary)",
    bgColor: "var(--surface-sunken)",
    icon: Clock,
  },
  completed: {
    label: "Done",
    color: "var(--pastel-mint-dark)",
    bgColor: "var(--pastel-mint-light)",
    icon: CheckCircle2,
  },
};

const getDaysRemaining = (deadline: string | null) => {
  if (!deadline) return null;
  return Math.ceil(
    (new Date(deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );
};

// ============================================================================
// Chart Tooltip
// ============================================================================

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="bg-white/95 backdrop-blur-sm border rounded-xl p-2 shadow-lg"
      style={{ borderColor: "var(--border)" }}
    >
      <p
        className="font-[family-name:var(--font-dm-sans)] text-[10px]"
        style={{ color: "var(--text-tertiary)" }}
      >
        {d.fullDate
          ? new Date(d.fullDate).toLocaleDateString("en-AU", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : d.date}
      </p>
      <p
        className="font-[family-name:var(--font-nunito)] text-sm font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {fmt(d.valueCents)}
      </p>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function GoalsClient({
  activeGoals,
  completedGoals,
  totalTarget,
  totalCurrent,
  saverAccounts,
  savingsHistory,
  currentPeriod,
  goalStatuses,
  budgetAllocations,
  totalBudgetAllocation,
  currentMonth,
  fireOnboarded,
}: GoalsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showCompleted, setShowCompleted] = useState(false);

  const overallProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;
  const remainingToSave = Math.max(totalTarget - totalCurrent, 0);

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`/goals?${params.toString()}`);
  };

  // Chart data
  const chartData = savingsHistory.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
    value: d.valueCents / 100,
    fullDate: d.date,
    valueCents: d.valueCents,
  }));

  const periodGain =
    savingsHistory.length >= 2
      ? savingsHistory[savingsHistory.length - 1].valueCents - savingsHistory[0].valueCents
      : 0;

  // Sort active goals: overdue first, then behind, then on-track, then ahead, then no-deadline
  const sortedActiveGoals = [...activeGoals].sort((a, b) => {
    const statusOrder: Record<GoalStatusType, number> = {
      overdue: 0,
      behind: 1,
      "on-track": 2,
      ahead: 3,
      "no-deadline": 4,
      completed: 5,
    };
    const aStatus = goalStatuses[a.id]?.status || "no-deadline";
    const bStatus = goalStatuses[b.id]?.status || "no-deadline";
    return statusOrder[aStatus] - statusOrder[bStatus];
  });

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
            Goals
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
            {activeGoals.length} active {activeGoals.length === 1 ? "goal" : "goals"}
            {completedGoals.length > 0 && ` \u00B7 ${completedGoals.length} completed`}
          </p>
        </div>
        <Link href="/goals/new">
          <Button
            className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-0 shadow-lg hover:shadow-xl text-sm hover:scale-105 transition-all"
            style={{ backgroundColor: "var(--pastel-purple)", color: "white" }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New Goal
          </Button>
        </Link>
      </motion.div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Savings Progress Chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 }}
          >
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className="text-[10px] font-medium uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Total Savings
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-3xl md:text-4xl font-bold tabular-nums"
                        style={{ color: "var(--text-primary)" }}
                      >
                        $
                        <NumberTicker
                          value={totalCurrent / 100}
                          decimalPlaces={0}
                          style={{ color: "var(--text-primary)" }}
                        />
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        of {fmt(totalTarget)} target
                      </span>
                      {periodGain > 0 && (
                        <span
                          className="text-sm font-medium flex items-center gap-1"
                          style={{ color: "var(--pastel-mint-dark)" }}
                        >
                          <TrendingUp className="h-3.5 w-3.5" />+{fmt(periodGain)} this period
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {PERIODS.map((p) => (
                      <button
                        key={p}
                        onClick={() => handlePeriodChange(p)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer"
                        style={{
                          backgroundColor:
                            currentPeriod === p ? "var(--pastel-purple)" : "transparent",
                          color: currentPeriod === p ? "white" : "var(--text-tertiary)",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-2 pb-1">
                {chartData.length > 1 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 16, right: 8, left: -12, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="5%"
                              stopColor="var(--pastel-purple)"
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--pastel-purple)"
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          opacity={0.3}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                          stroke="none"
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                          stroke="none"
                          tickLine={false}
                          tickFormatter={(v) =>
                            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                          }
                          width={42}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="var(--pastel-purple-dark)"
                          strokeWidth={2}
                          fill="url(#savingsGrad)"
                          dot={false}
                          activeDot={{ r: 4, fill: "var(--pastel-purple-dark)" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      Add funds to your goals to see your savings trend
                    </p>
                  </div>
                )}
              </div>
              {/* Overall progress bar */}
              <div
                className="px-5 py-3 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Overall Progress
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: "var(--pastel-purple-dark)" }}
                  >
                    {overallProgress.toFixed(0)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(overallProgress, 100)}
                  className="h-2"
                  indicatorColor="var(--pastel-purple-dark)"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {fmt(totalCurrent)} saved
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {fmt(remainingToSave)} to go
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Active Goals Table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div
                className="px-5 py-3.5 flex items-center justify-between border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="font-[family-name:var(--font-nunito)] text-base font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Active Goals
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {activeGoals.length} {activeGoals.length === 1 ? "goal" : "goals"}
                </span>
              </div>

              {/* Table header (desktop) */}
              <div
                className="hidden md:grid grid-cols-[1fr_90px_100px_80px_32px] gap-3 px-5 py-2 text-[10px] font-medium uppercase tracking-wider"
                style={{
                  color: "var(--text-tertiary)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span>Goal</span>
                <span className="text-right">Progress</span>
                <span className="text-right">Saved</span>
                <span className="text-right">Status</span>
                <span />
              </div>

              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {sortedActiveGoals.map((goal) => {
                  const progress = Math.min(
                    (goal.current_amount_cents / goal.target_amount_cents) * 100,
                    100
                  );
                  const status = goalStatuses[goal.id];
                  const statusConfig = status
                    ? STATUS_CONFIG[status.status]
                    : STATUS_CONFIG["no-deadline"];
                  const StatusIcon = statusConfig.icon;
                  const daysRemaining = getDaysRemaining(goal.deadline || null);

                  return (
                    <Link key={goal.id} href={`/goals/${goal.id}`} className="group">
                      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_100px_80px_32px] gap-3 items-center px-5 py-3 hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer">
                        {/* Goal name + metadata */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                            style={{ backgroundColor: `${goal.color}20` }}
                          >
                            {getGoalEmoji(goal.icon)}
                          </div>
                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {goal.name}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {goal.deadline && (
                                <span
                                  className="text-[10px] flex items-center gap-0.5"
                                  style={{
                                    color:
                                      daysRemaining !== null && daysRemaining < 0
                                        ? "var(--pastel-coral-dark)"
                                        : daysRemaining !== null && daysRemaining <= 30
                                          ? "var(--pastel-yellow-dark)"
                                          : "var(--text-tertiary)",
                                  }}
                                >
                                  <Calendar className="h-2.5 w-2.5" />
                                  {daysRemaining !== null && daysRemaining > 0
                                    ? `${daysRemaining}d left`
                                    : daysRemaining === 0
                                      ? "Due today"
                                      : `${Math.abs(daysRemaining!)}d overdue`}
                                </span>
                              )}
                              {/* Mobile: progress inline */}
                              <div className="md:hidden flex items-center gap-1">
                                <Progress
                                  value={progress}
                                  indicatorColor={goal.color}
                                  className="h-1 w-12"
                                />
                                <span
                                  className="text-[10px] font-medium tabular-nums"
                                  style={{ color: goal.color }}
                                >
                                  {progress.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Mobile: value + status */}
                        <div className="md:hidden text-right">
                          <p
                            className="text-sm font-semibold tabular-nums"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {fmt(goal.current_amount_cents)}
                          </p>
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: statusConfig.bgColor,
                              color: statusConfig.color,
                            }}
                          >
                            <StatusIcon className="h-2.5 w-2.5" />
                            {statusConfig.label}
                          </span>
                        </div>

                        {/* Desktop: Progress column */}
                        <div className="hidden md:flex items-center justify-end gap-2">
                          <Progress
                            value={progress}
                            indicatorColor={goal.color}
                            className="h-1.5 w-14"
                          />
                          <span
                            className="text-xs font-semibold tabular-nums"
                            style={{ color: goal.color }}
                          >
                            {progress.toFixed(0)}%
                          </span>
                        </div>

                        {/* Desktop: Saved column */}
                        <div className="hidden md:block text-right">
                          <span
                            className="text-sm font-semibold tabular-nums"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {fmt(goal.current_amount_cents)}
                          </span>
                          <p
                            className="text-[10px] tabular-nums"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            of {fmt(goal.target_amount_cents)}
                          </p>
                        </div>

                        {/* Desktop: Status column */}
                        <div className="hidden md:flex justify-end">
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
                            style={{
                              backgroundColor: statusConfig.bgColor,
                              color: statusConfig.color,
                            }}
                          >
                            <StatusIcon className="h-2.5 w-2.5" />
                            {statusConfig.label}
                          </span>
                        </div>

                        {/* Chevron */}
                        <ChevronRight
                          className="hidden md:block h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--text-tertiary)" }}
                        />
                      </div>
                    </Link>
                  );
                })}

                {activeGoals.length === 0 && (
                  <div className="py-12 text-center">
                    <div className="text-4xl mb-3">{"\u{1F3AF}"}</div>
                    <p
                      className="font-[family-name:var(--font-nunito)] font-bold text-sm mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      No active goals yet
                    </p>
                    <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
                      Start saving towards something special
                    </p>
                    <Link href="/goals/new">
                      <Button
                        className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-0 text-sm"
                        style={{
                          backgroundColor: "var(--pastel-purple)",
                          color: "white",
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Goal
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Completed Goals (collapsible) */}
          {completedGoals.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.11 }}
            >
              <div
                className="border-0 shadow-sm rounded-2xl overflow-hidden"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-[var(--surface-sunken)] transition-colors"
                  style={{ borderBottom: showCompleted ? "1px solid var(--border)" : "none" }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className="h-4 w-4"
                      style={{ color: "var(--pastel-mint-dark)" }}
                    />
                    <span
                      className="font-[family-name:var(--font-nunito)] text-base font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Completed
                    </span>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--pastel-mint-light)",
                        color: "var(--pastel-mint-dark)",
                      }}
                    >
                      {completedGoals.length}
                    </span>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 transition-transform"
                    style={{
                      color: "var(--text-tertiary)",
                      transform: showCompleted ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                </button>

                {showCompleted && (
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {completedGoals.map((goal) => (
                      <div
                        key={goal.id}
                        className="flex items-center gap-3 px-5 py-3"
                        style={{ opacity: 0.8 }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                          style={{ backgroundColor: `${goal.color}15` }}
                        >
                          {getGoalEmoji(goal.icon)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {goal.name}
                          </p>
                          <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            {fmt(goal.target_amount_cents)}
                            {goal.completed_at &&
                              ` \u00B7 ${new Date(goal.completed_at).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`}
                          </p>
                        </div>
                        <CheckCircle2
                          className="h-4 w-4 flex-shrink-0"
                          style={{ color: "var(--pastel-mint-dark)" }}
                        />
                        <GoalActionsMenu goalId={goal.id} goalName={goal.name} isCompleted={goal.is_completed} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* RIGHT COLUMN (Sidebar) */}
        <div className="space-y-4 md:space-y-6">
          {/* Savings Summary */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
          >
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div
                className="px-5 py-3.5 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="font-[family-name:var(--font-nunito)] text-base font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Summary
                </span>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Total Target
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fmt(totalTarget)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Total Saved
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: "var(--pastel-purple-dark)" }}
                  >
                    {fmt(totalCurrent)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Remaining
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fmt(remainingToSave)}
                  </span>
                </div>
                <div
                  className="pt-3 border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Active Goals
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {activeGoals.length}
                    </span>
                  </div>
                  {completedGoals.length > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Completed
                      </span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: "var(--pastel-mint-dark)" }}
                      >
                        {completedGoals.length}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Goal Health Overview */}
          {activeGoals.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
            >
              <div
                className="border-0 shadow-sm rounded-2xl overflow-hidden"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <div
                  className="px-5 py-3.5 border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span
                    className="font-[family-name:var(--font-nunito)] text-base font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Goal Health
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {sortedActiveGoals.map((goal) => {
                    const status = goalStatuses[goal.id];
                    if (!status) return null;
                    const config = STATUS_CONFIG[status.status];
                    const StatusIcon = config.icon;

                    return (
                      <Link key={goal.id} href={`/goals/${goal.id}`}>
                        <div className="px-5 py-3 hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm">{getGoalEmoji(goal.icon)}</span>
                              <span
                                className="text-xs font-medium truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {goal.name}
                              </span>
                            </div>
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: config.bgColor,
                                color: config.color,
                              }}
                            >
                              <StatusIcon className="h-2.5 w-2.5" />
                              {config.label}
                            </span>
                          </div>
                          {status.projectedCompletionDate && (
                            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                              Est. completion:{" "}
                              {status.projectedCompletionDate.toLocaleDateString("en-AU", {
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          )}
                          {status.monthlySavingsNeeded > 0 && (
                            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                              Need {fmt(status.monthlySavingsNeeded)}/mo to hit deadline
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* Budget Allocations */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Link href="/budget" className="block group">
              <div
                className="border-0 shadow-sm rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--pastel-blue-light)" }}
                  >
                    <Wallet className="h-4 w-4" style={{ color: "var(--pastel-blue-dark)" }} />
                  </div>
                  <div className="flex-1">
                    <p
                      className="text-xs font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Budget Allocations
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {currentMonth}
                    </p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-tertiary)" }}
                  />
                </div>
                {budgetAllocations.length > 0 ? (
                  <div className="space-y-2">
                    {budgetAllocations.map((a, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{getGoalEmoji(a.goalIcon)}</span>
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {a.goalName}
                          </span>
                        </div>
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color: "var(--pastel-blue-dark)" }}
                        >
                          {fmt(a.assignedCents)}
                        </span>
                      </div>
                    ))}
                    <div
                      className="pt-2 mt-2 border-t flex items-center justify-between"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Total
                      </span>
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: "var(--pastel-blue-dark)" }}
                      >
                        {fmt(totalBudgetAllocation)}/mo
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    No monthly allocations set. Assign budgets to your goals on the budget page.
                  </p>
                )}
              </div>
            </Link>
          </motion.div>

          {/* FIRE Integration Card */}
          {fireOnboarded && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              <Link href="/plan" className="block group">
                <div
                  className="border-0 shadow-sm rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer"
                  style={{ backgroundColor: "var(--surface-elevated)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "var(--pastel-coral-light)" }}
                    >
                      <Flame
                        className="h-4 w-4"
                        style={{ color: "var(--pastel-coral-dark)" }}
                      />
                    </div>
                    <div className="flex-1">
                      <p
                        className="text-xs font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        FIRE Plan
                      </p>
                      <p
                        className="text-[10px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        See how goals fit into your retirement plan
                      </p>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--text-tertiary)" }}
                    />
                  </div>
                </div>
              </Link>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
