"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Edit,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Plus,
  Wallet,
  Clock,
  AlertTriangle,
  Zap,
  LinkIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { addFundsToGoal, markGoalComplete, reopenGoal, toggleGoalChecklistItem } from "@/app/actions/goals";
import { GoalActionsMenu } from "./goal-actions-menu";

import type { GoalDataPoint, GoalStatus, GoalStatusType } from "@/lib/goal-calculations";
import { calculateSuggestedSavings } from "@/lib/goal-calculations";

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
  created_at: string;
  description?: string | null;
  preparation_checklist?: { item: string; done: boolean }[];
  estimated_monthly_impact_cents?: number;
}

interface ContributionRecord {
  id: string;
  goal_id: string;
  amount_cents: number;
  balance_after_cents: number;
  source: string;
  created_at: string;
}

interface GoalDetailClientProps {
  goal: Goal;
  historyData: GoalDataPoint[];
  currentPeriod: string;
  status: GoalStatus;
  budgetAllocationCents: number;
  recentContributions: ContributionRecord[];
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
  { label: string; color: string; bgColor: string }
> = {
  "on-track": {
    label: "On Track",
    color: "var(--pastel-mint-dark)",
    bgColor: "var(--pastel-mint-light)",
  },
  ahead: {
    label: "Ahead of Schedule",
    color: "var(--pastel-mint-dark)",
    bgColor: "var(--pastel-mint-light)",
  },
  behind: {
    label: "Behind Schedule",
    color: "var(--pastel-yellow-dark)",
    bgColor: "var(--pastel-yellow-light)",
  },
  overdue: {
    label: "Overdue",
    color: "var(--pastel-coral-dark)",
    bgColor: "var(--pastel-coral-light)",
  },
  "no-deadline": {
    label: "No Deadline",
    color: "var(--text-tertiary)",
    bgColor: "var(--surface-sunken)",
  },
  completed: {
    label: "Completed",
    color: "var(--pastel-mint-dark)",
    bgColor: "var(--pastel-mint-light)",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  webhook_sync: "Auto-sync",
  budget_allocation: "Budget",
  initial: "Initial",
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

export function GoalDetailClient({
  goal,
  historyData,
  currentPeriod,
  status,
  budgetAllocationCents,
  recentContributions,
}: GoalDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [addingFunds, setAddingFunds] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [reopening, setReopening] = useState(false);

  const progress = Math.min(
    (goal.current_amount_cents / goal.target_amount_cents) * 100,
    100
  );
  const remaining = Math.max(goal.target_amount_cents - goal.current_amount_cents, 0);
  const statusConfig = STATUS_CONFIG[status.status];

  const linkedAccount = Array.isArray(goal.linked_account)
    ? goal.linked_account[0]
    : goal.linked_account;

  const daysRemaining = goal.deadline
    ? Math.ceil(
        (new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`/goals/${goal.id}?${params.toString()}`);
  };

  const handleAddFunds = async () => {
    const amount = parseFloat(addFundsAmount);
    if (isNaN(amount) || amount <= 0) return;
    setAddingFunds(true);
    await addFundsToGoal(goal.id, Math.round(amount * 100));
    setAddingFunds(false);
    setAddFundsAmount("");
    setShowAddFunds(false);
    router.refresh();
  };

  const handleMarkComplete = async () => {
    setCompleting(true);
    await markGoalComplete(goal.id);
    setCompleting(false);
    router.refresh();
  };

  const handleReopenGoal = async () => {
    setReopening(true);
    await reopenGoal(goal.id);
    setReopening(false);
    router.refresh();
  };

  // Chart data
  const chartData = historyData.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
    value: d.valueCents / 100,
    fullDate: d.date,
    valueCents: d.valueCents,
  }));

  const periodGain =
    historyData.length >= 2
      ? historyData[historyData.length - 1].valueCents - historyData[0].valueCents
      : 0;

  // Build stats
  const daysSinceCreated = Math.max(
    1,
    Math.floor(
      (new Date().getTime() - new Date(goal.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
  );

  const stats = [
    { label: "Target", value: fmt(goal.target_amount_cents), color: "var(--text-primary)" },
    {
      label: "Saved",
      value: fmt(goal.current_amount_cents),
      color: "var(--pastel-purple-dark)",
    },
    { label: "Remaining", value: fmt(remaining), color: "var(--text-primary)" },
    {
      label: "Progress",
      value: `${progress.toFixed(1)}%`,
      color: goal.color,
    },
    ...(goal.deadline
      ? [
          {
            label: "Deadline",
            value: new Date(goal.deadline).toLocaleDateString("en-AU", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            color:
              daysRemaining !== null && daysRemaining < 0
                ? "var(--pastel-coral-dark)"
                : daysRemaining !== null && daysRemaining <= 30
                  ? "var(--pastel-yellow-dark)"
                  : "var(--text-primary)",
          },
        ]
      : []),
    {
      label: "Days Active",
      value: daysSinceCreated.toLocaleString(),
      color: "var(--text-primary)",
    },
    ...(status.currentMonthlySavingsRate > 0
      ? [
          {
            label: "Monthly Savings Rate",
            value: fmt(status.currentMonthlySavingsRate),
            color: "var(--pastel-mint-dark)",
          },
        ]
      : []),
    ...(budgetAllocationCents > 0
      ? [
          {
            label: "Budget Allocation",
            value: `${fmt(budgetAllocationCents)}/mo`,
            color: "var(--pastel-blue-dark)",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
      {/* Breadcrumb + header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href="/goals"
          className="text-sm flex items-center gap-1 hover:gap-2 transition-all mb-3 cursor-pointer"
          style={{ color: "var(--text-tertiary)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Goals
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{getGoalEmoji(goal.icon)}</span>
              <span
                className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: statusConfig.bgColor,
                  color: statusConfig.color,
                }}
              >
                {statusConfig.label}
              </span>
            </div>
            <h1
              className="text-xl md:text-2xl font-bold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {goal.name}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!goal.is_completed && (
              <Button
                onClick={() => setShowAddFunds(!showAddFunds)}
                variant="outline"
                className="rounded-xl border-0 shadow-sm text-sm"
                style={{
                  backgroundColor: "var(--surface-elevated)",
                  color: "var(--text-secondary)",
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Funds
              </Button>
            )}
            <Link href={`/goals/${goal.id}/edit`}>
              <Button
                className="rounded-xl border-0 shadow-sm text-sm"
                style={{ backgroundColor: "var(--pastel-purple)", color: "white" }}
              >
                <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            </Link>
            <GoalActionsMenu goalId={goal.id} goalName={goal.name} isCompleted={goal.is_completed} />
          </div>
        </div>
        {goal.description && (
          <p
            className="text-sm mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            {goal.description}
          </p>
        )}
      </motion.div>

      {/* Add Funds inline form */}
      {showAddFunds && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-4"
        >
          <div
            className="border-0 shadow-sm rounded-2xl p-4 flex items-center gap-3"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              $
            </span>
            <input
              type="number"
              value={addFundsAmount}
              onChange={(e) => setAddFundsAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-lg font-bold outline-none tabular-nums"
              style={{ color: "var(--text-primary)" }}
              min="0"
              step="0.01"
              autoFocus
            />
            <Button
              onClick={handleAddFunds}
              disabled={addingFunds || !addFundsAmount || parseFloat(addFundsAmount) <= 0}
              className="rounded-xl border-0 text-sm"
              style={{ backgroundColor: "var(--pastel-purple)", color: "white" }}
            >
              {addingFunds ? "Adding..." : "Add"}
            </Button>
            <Button
              onClick={() => {
                setShowAddFunds(false);
                setAddFundsAmount("");
              }}
              variant="ghost"
              className="rounded-xl text-sm"
            >
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* LEFT: Chart + contributions */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Savings Chart */}
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
                      Saved
                    </p>
                    <div
                      className="text-3xl md:text-4xl font-bold tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {fmt(goal.current_amount_cents)}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        of {fmt(goal.target_amount_cents)}
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
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 16, right: 8, left: -12, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="goalGrad" x1="0" y1="0" x2="0" y2="1">
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
                          fill="url(#goalGrad)"
                          dot={false}
                          activeDot={{ r: 4, fill: "var(--pastel-purple-dark)" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      Add funds a few times to see your savings trend
                    </p>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                    Goal Progress
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: goal.color }}
                  >
                    {progress.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={progress}
                  className="h-2.5"
                  indicatorColor={goal.color}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {fmt(goal.current_amount_cents)} saved
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {fmt(remaining)} to go
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Contribution Log */}
          {recentContributions.length > 0 && (
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
                  className="px-5 py-3.5 border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span
                    className="font-[family-name:var(--font-nunito)] text-base font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Recent Activity
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {recentContributions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0"
                          style={{
                            backgroundColor:
                              c.amount_cents > 0
                                ? "var(--pastel-mint-light)"
                                : "var(--pastel-coral-light)",
                          }}
                        >
                          {c.amount_cents > 0 ? (
                            <Plus
                              className="h-3 w-3"
                              style={{ color: "var(--pastel-mint-dark)" }}
                            />
                          ) : (
                            <span style={{ color: "var(--pastel-coral-dark)" }}>-</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                            {c.amount_cents > 0 ? "+" : ""}
                            {fmt(c.amount_cents)}
                          </p>
                          <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            {SOURCE_LABELS[c.source] || c.source} &middot;{" "}
                            {new Date(c.created_at).toLocaleDateString("en-AU", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {fmt(c.balance_after_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* RIGHT: Stats sidebar */}
        <div className="space-y-4 md:space-y-6">
          {/* Key stats */}
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
                  className="text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Details
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {stat.label}
                    </span>
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: stat.color }}
                    >
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Projections */}
          {!goal.is_completed && (
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
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Projections
                  </span>
                </div>
                <div className="p-5 space-y-3">
                  {status.projectedCompletionDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Est. Completion
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {status.projectedCompletionDate.toLocaleDateString("en-AU", {
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const remaining = goal.target_amount_cents - goal.current_amount_cents;
                    const suggested = calculateSuggestedSavings(remaining, goal.deadline);
                    if (!suggested.hasDeadline || remaining <= 0) return null;
                    return (
                      <>
                        <div className="pt-1">
                          <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                            Suggested savings
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg py-2 px-1" style={{ backgroundColor: "var(--surface)" }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Weekly</p>
                            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: "var(--pastel-yellow-dark)" }}>
                              {fmt(suggested.weekly)}
                            </p>
                          </div>
                          <div className="rounded-lg py-2 px-1" style={{ backgroundColor: "var(--surface)" }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Fortnightly</p>
                            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: "var(--pastel-yellow-dark)" }}>
                              {fmt(suggested.fortnightly)}
                            </p>
                          </div>
                          <div className="rounded-lg py-2 px-1" style={{ backgroundColor: "var(--surface)" }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Monthly</p>
                            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm" style={{ color: "var(--pastel-yellow-dark)" }}>
                              {fmt(suggested.monthly)}
                            </p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  {status.currentMonthlySavingsRate > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Actual/month
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "var(--pastel-mint-dark)" }}
                      >
                        {fmt(status.currentMonthlySavingsRate)}
                      </span>
                    </div>
                  )}
                  {!status.projectedCompletionDate &&
                    status.currentMonthlySavingsRate === 0 && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Start adding funds to see projected completion
                      </p>
                    )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Linked Account */}
          {linkedAccount && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              <div
                className="border-0 shadow-sm rounded-2xl p-4"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--pastel-blue-light)" }}
                  >
                    <LinkIcon
                      className="h-4 w-4"
                      style={{ color: "var(--pastel-blue-dark)" }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-xs font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Linked to UP Bank Saver
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {linkedAccount.display_name} &middot; Balance auto-syncs
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Preparation Checklist */}
          {goal.preparation_checklist && goal.preparation_checklist.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.09 }}
            >
              <div
                className="border-0 shadow-sm rounded-2xl overflow-hidden"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <div
                  className="px-5 py-3.5 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span
                    className="text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Preparation
                  </span>
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {goal.preparation_checklist.filter((c) => c.done).length}/{goal.preparation_checklist.length}
                  </span>
                </div>
                <div className="px-5 py-3 space-y-2">
                  {goal.preparation_checklist.map((item, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-2.5 text-sm cursor-pointer"
                      style={{
                        color: item.done
                          ? "var(--text-tertiary)"
                          : "var(--text-secondary)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleGoalChecklistItem(goal.id, idx)}
                        className="rounded cursor-pointer"
                      />
                      <span className={item.done ? "line-through" : ""}>
                        {item.item}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Monthly Impact */}
          {goal.estimated_monthly_impact_cents !== undefined && goal.estimated_monthly_impact_cents !== 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.09 }}
            >
              <div
                className="border-0 shadow-sm rounded-2xl p-4"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: goal.estimated_monthly_impact_cents > 0
                        ? "var(--pastel-coral-light)"
                        : "var(--pastel-mint-light)",
                    }}
                  >
                    <Zap
                      className="h-4 w-4"
                      style={{
                        color: goal.estimated_monthly_impact_cents > 0
                          ? "var(--pastel-coral-dark)"
                          : "var(--pastel-mint-dark)",
                      }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-xs font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Estimated Monthly Impact
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {goal.estimated_monthly_impact_cents > 0 ? "+" : ""}
                      {fmt(goal.estimated_monthly_impact_cents)}/mo on your budget
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Quick Actions */}
          {!goal.is_completed ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div
                className="border-0 shadow-sm rounded-2xl p-4 space-y-2"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <Button
                  onClick={handleMarkComplete}
                  disabled={completing}
                  variant="outline"
                  className="w-full rounded-xl border-0 text-sm justify-start"
                  style={{
                    backgroundColor: "var(--pastel-mint-light)",
                    color: "var(--pastel-mint-dark)",
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                  {completing ? "Completing..." : "Mark as Complete"}
                </Button>
                <Link href="/budget" className="block">
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-0 text-sm justify-start"
                    style={{
                      backgroundColor: "var(--pastel-blue-light)",
                      color: "var(--pastel-blue-dark)",
                    }}
                  >
                    <Wallet className="h-3.5 w-3.5 mr-2" />
                    Set Budget Allocation
                  </Button>
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div
                className="border-0 shadow-sm rounded-2xl p-4"
                style={{ backgroundColor: "var(--surface-elevated)" }}
              >
                <Button
                  onClick={handleReopenGoal}
                  disabled={reopening}
                  variant="outline"
                  className="w-full rounded-xl border-0 text-sm justify-start cursor-pointer"
                  style={{
                    backgroundColor: "var(--pastel-yellow-light)",
                    color: "var(--pastel-yellow-dark)",
                  }}
                >
                  <Clock className="h-3.5 w-3.5 mr-2" />
                  {reopening ? "Reopening..." : "Reopen Goal"}
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
