"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronRight,
  Flame,
  Wallet,
  Scale,
  Eye,
  ChevronDown,
  ChevronUp,
  Trash2,
  Banknote,
} from "lucide-react";
import Link from "next/link";
import { updateInvestmentPriceFromAPI, refreshAllPrices } from "@/app/actions/investments";
import { deleteWatchlistItem, refreshWatchlistPrice } from "@/app/actions/watchlist";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

import type { PortfolioDataPoint, TopMover, RebalanceDelta } from "@/lib/portfolio-aggregation";

// ============================================================================
// Types
// ============================================================================

interface Investment {
  id: string;
  asset_type: string;
  name: string;
  ticker_symbol?: string | null;
  quantity?: number | null;
  purchase_value_cents?: number | null;
  current_value_cents: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface Allocation {
  type: string;
  value: number;
  count: number;
}

interface FireProgressData {
  progressPercent: number;
  fireNumberCents: number;
  currentTotalCents: number;
  fireVariant: string;
}

interface BudgetContribution {
  investmentName: string;
  assignedCents: number;
}

interface WatchlistItem {
  id: string;
  name: string;
  ticker_symbol: string | null;
  asset_type: string;
  last_price_cents: number | null;
  last_price_updated_at: string | null;
}

interface MonthlyDividend {
  month: string;
  amountCents: number;
}

interface InvestClientProps {
  investments: Investment[];
  investmentsByType: Record<string, Investment[]>;
  allocation: Allocation[];
  totalValue: number;
  totalGain: number;
  totalGainPercentage: number;
  portfolioHistory: PortfolioDataPoint[];
  currentPeriod: string;
  performanceMetrics: {
    totalROIPercent: number;
    totalGainCents: number;
    bestPerformer: { name: string; gainPercent: number } | null;
    worstPerformer: { name: string; gainPercent: number } | null;
  };
  topMovers: { gainers: TopMover[]; losers: TopMover[] };
  rebalanceDeltas: RebalanceDelta[];
  hasTargetAllocations: boolean;
  fireProgress: FireProgressData | null;
  budgetContributions: BudgetContribution[];
  totalBudgetContribution: number;
  currentMonth: string;
  watchlistItems: WatchlistItem[];
  monthlyDividends: MonthlyDividend[];
  annualDividendTotal: number;
  monthlyDividendAvg: number;
}

// ============================================================================
// Helpers
// ============================================================================

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);

const fmtCompact = (cents: number) => {
  const d = Math.abs(cents) / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (d >= 1_000) return `$${(d / 1_000).toFixed(0)}k`;
  return `$${d.toFixed(0)}`;
};

const ASSET_ICON: Record<string, string> = { stock: "\u{1F4C8}", etf: "\u{1F4CA}", crypto: "\u20BF", property: "\u{1F3E0}", other: "\u{1F4BC}" };
const ASSET_LABEL: Record<string, string> = { stock: "Stocks", etf: "ETFs", crypto: "Crypto", property: "Property", other: "Other" };
const ASSET_COLORS: Record<string, string> = { stock: "var(--pastel-blue)", etf: "var(--pastel-purple)", crypto: "var(--pastel-yellow)", property: "var(--pastel-mint)", other: "var(--pastel-coral)" };
const ASSET_HEX: Record<string, string> = { stock: "#7BA4D9", etf: "#B08BD9", crypto: "#E8D44D", property: "#6CC4A1", other: "#E88B8B" };
const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "ALL"] as const;

// ============================================================================
// SVG Donut Chart (zero-dependency)
// ============================================================================

interface DonutSlice { label: string; value: number; pct: string; color: string }

function AllocationDonut({ data, total }: { data: DonutSlice[]; total: number }) {
  const size = 120;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  // Build cumulative offsets for each arc
  let cumulative = 0;
  const arcs = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0;
    const dashLength = fraction * circumference;
    const gap = circumference - dashLength;
    const offset = -cumulative * circumference + circumference * 0.25; // rotate -90deg start
    cumulative += fraction;
    return { ...d, dashLength, gap, offset };
  });

  return (
    <div className="flex items-center justify-center gap-5 p-4">
      {/* SVG donut — left side */}
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} opacity={0.4} />
          {/* Slices */}
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arc.dashLength} ${arc.gap}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease" }}
            />
          ))}
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="font-[family-name:var(--font-nunito)] text-sm font-black" style={{ color: "var(--text-primary)" }}>
              {fmt(total)}
            </div>
            <div className="font-[family-name:var(--font-dm-sans)] text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              Total
            </div>
          </div>
        </div>
      </div>

      {/* Legend — right side */}
      <div className="space-y-2 min-w-0">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-[4px] flex-shrink-0" style={{ backgroundColor: d.color }} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-[family-name:var(--font-dm-sans)] text-sm font-medium" style={{ color: "var(--text-primary)" }}>{d.label}</span>
                <span className="font-[family-name:var(--font-nunito)] text-xs font-bold tabular-nums" style={{ color: "var(--text-secondary)" }}>{d.pct}%</span>
              </div>
              <span className="font-[family-name:var(--font-dm-sans)] text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>{fmt(d.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Chart Tooltips
// ============================================================================

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-xl p-2 shadow-lg" style={{ borderColor: "var(--border)" }}>
      <p className="font-[family-name:var(--font-dm-sans)] text-[10px]" style={{ color: "var(--text-tertiary)" }}>
        {d.fullDate ? new Date(d.fullDate).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" }) : d.date}
      </p>
      <p className="font-[family-name:var(--font-nunito)] text-sm font-bold" style={{ color: "var(--text-primary)" }}>{fmt(d.valueCents)}</p>
    </div>
  );
}

function DividendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border rounded-xl p-2 shadow-lg" style={{ borderColor: "var(--border)" }}>
      <p className="font-[family-name:var(--font-dm-sans)] text-[10px]" style={{ color: "var(--text-tertiary)" }}>{payload[0].payload.month}</p>
      <p className="font-[family-name:var(--font-nunito)] text-xs font-bold" style={{ color: "var(--pastel-mint-dark)" }}>{fmt(payload[0].payload.amountCents)}</p>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function InvestClient({
  investments,
  investmentsByType,
  allocation,
  totalValue,
  totalGain,
  totalGainPercentage,
  portfolioHistory,
  currentPeriod,
  performanceMetrics,
  topMovers,
  rebalanceDeltas,
  hasTargetAllocations,
  fireProgress,
  budgetContributions,
  totalBudgetContribution,
  currentMonth,
  watchlistItems,
  monthlyDividends,
  annualDividendTotal,
  monthlyDividendAvg,
}: InvestClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [updatingPrices, setUpdatingPrices] = useState<Record<string, boolean>>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ refreshed: number; errors: string[] } | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(watchlistItems.length <= 3);
  const [watchlistRefreshing, setWatchlistRefreshing] = useState<Record<string, boolean>>({});
  const [watchlistDeleting, setWatchlistDeleting] = useState<Record<string, boolean>>({});

  const handleUpdatePrice = async (investmentId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUpdatingPrices((p) => ({ ...p, [investmentId]: true }));
    setPriceErrors((p) => ({ ...p, [investmentId]: "" }));
    const result = await updateInvestmentPriceFromAPI(investmentId);
    if (result.error) setPriceErrors((p) => ({ ...p, [investmentId]: result.error! }));
    else router.refresh();
    setUpdatingPrices((p) => ({ ...p, [investmentId]: false }));
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    setRefreshResult(null);
    const result = await refreshAllPrices();
    if ("refreshed" in result) setRefreshResult(result as any);
    setRefreshingAll(false);
    router.refresh();
  };

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`/invest?${params.toString()}`);
  };

  // Derived data
  const isPositiveGain = totalGain >= 0;
  const chartData = portfolioHistory.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
    value: d.valueCents / 100,
    fullDate: d.date,
    valueCents: d.valueCents,
  }));
  const periodGain = portfolioHistory.length >= 2 ? portfolioHistory[portfolioHistory.length - 1].valueCents - portfolioHistory[0].valueCents : 0;
  const periodGainPercent = portfolioHistory.length >= 2 && portfolioHistory[0].valueCents > 0 ? (periodGain / portfolioHistory[0].valueCents) * 100 : 0;
  const isPeriodPositive = periodGain >= 0;
  const totalAllocation = allocation.reduce((s, a) => s + a.value, 0);
  const donutData: DonutSlice[] = allocation.map((a) => ({
    label: ASSET_LABEL[a.type] || a.type,
    value: a.value,
    pct: totalAllocation > 0 ? ((a.value / totalAllocation) * 100).toFixed(1) : "0",
    color: ASSET_HEX[a.type] || "#E88B8B",
  }));
  const significantDeltas = rebalanceDeltas.filter((d) => Math.abs(d.deltaPercent) >= 1);
  const dividendChartData = monthlyDividends.map((d) => ({ month: d.month, amount: d.amountCents / 100, amountCents: d.amountCents }));
  const hasDividends = annualDividendTotal > 0 || monthlyDividends.some((d) => d.amountCents > 0);
  const fireLabel = fireProgress?.fireVariant === "lean" ? "Lean" : fireProgress?.fireVariant === "fat" ? "Fat" : fireProgress?.fireVariant === "coast" ? "Coast" : "Regular";

  // Build a flat sorted list of all holdings for the main table
  const allHoldings = investments.slice().sort((a, b) => b.current_value_cents - a.current_value_cents);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>

      {/* ─── Header ─── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">Investing</h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">{investments.length} {investments.length === 1 ? "asset" : "assets"} tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleRefreshAll} disabled={refreshingAll} variant="outline" className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-0 shadow-sm text-sm" style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-secondary)" }}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshingAll ? "animate-spin" : ""}`} />
            {refreshingAll ? "Updating" : "Refresh"}
          </Button>
          <Link href="/invest/add">
            <Button className="rounded-xl font-[family-name:var(--font-nunito)] font-bold border-0 shadow-lg hover:shadow-xl text-sm hover:scale-105 transition-all" style={{ backgroundColor: "var(--pastel-blue)", color: "white" }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Asset
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Refresh result banner */}
      <AnimatePresence>
        {refreshResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-4 px-4 py-2.5 rounded-xl text-sm"
            style={{
              backgroundColor: refreshResult.errors.length > 0 ? "var(--pastel-yellow-light)" : "var(--pastel-mint-light)",
              color: refreshResult.errors.length > 0 ? "var(--pastel-yellow-dark)" : "var(--pastel-mint-dark)",
            }}
          >
            Updated {refreshResult.refreshed} price{refreshResult.refreshed !== 1 ? "s" : ""}
            {refreshResult.errors.length > 0 && `: ${refreshResult.errors.join(", ")}`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Quick Stats Strip ─── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.01 }} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:mb-6">
        <div className="border-0 shadow-sm rounded-2xl p-4" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Cost Basis</p>
          <p className="font-[family-name:var(--font-nunito)] text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmt(totalValue - totalGain)}</p>
        </div>
        <div className="border-0 shadow-sm rounded-2xl p-4" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Unrealized P&L</p>
          <p className="font-[family-name:var(--font-nunito)] text-lg font-bold tabular-nums" style={{ color: totalGain >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
            {totalGain >= 0 ? "+" : ""}{fmt(Math.abs(totalGain))}
          </p>
        </div>
        <div className="border-0 shadow-sm rounded-2xl p-4" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Dividend Income</p>
          <p className="font-[family-name:var(--font-nunito)] text-lg font-bold tabular-nums" style={{ color: annualDividendTotal > 0 ? "var(--pastel-mint-dark)" : "var(--text-secondary)" }}>
            {annualDividendTotal > 0 ? fmt(annualDividendTotal) : "\u2014"}
          </p>
        </div>
        <div className="border-0 shadow-sm rounded-2xl p-4" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Diversity</p>
          <p className="font-[family-name:var(--font-nunito)] text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {allocation.length} {allocation.length === 1 ? "type" : "types"}
            <span className="text-xs font-normal ml-1.5" style={{ color: "var(--text-tertiary)" }}>{investments.length} holdings</span>
          </p>
        </div>
      </motion.div>

      {/* ─── Main 2-column layout (like dashboard) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

        {/* ═══ LEFT COLUMN ═══ */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">

          {/* ── Portfolio Value + Line Chart ── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Portfolio Value</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl md:text-4xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                        $<NumberTicker value={totalValue / 100} decimalPlaces={0} style={{ color: "var(--text-primary)" }} />
                      </span>
                    </div>
                    {totalGain !== 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {isPositiveGain ? <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--pastel-mint-dark)" }} /> : <TrendingDown className="h-3.5 w-3.5" style={{ color: "var(--pastel-coral-dark)" }} />}
                        <span className="text-sm font-medium" style={{ color: isPositiveGain ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
                          {isPositiveGain ? "+" : ""}{fmt(Math.abs(totalGain))} ({totalGainPercentage.toFixed(1)}%) all time
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {PERIODS.map((p) => (
                      <button key={p} onClick={() => handlePeriodChange(p)} className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer" style={{ backgroundColor: currentPeriod === p ? "var(--pastel-blue)" : "transparent", color: currentPeriod === p ? "white" : "var(--text-tertiary)" }}>
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
                      <AreaChart data={chartData} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isPeriodPositive ? "var(--pastel-mint)" : "var(--pastel-coral)"} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={isPeriodPositive ? "var(--pastel-mint)" : "var(--pastel-coral)"} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} stroke="none" tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} stroke="none" tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={42} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="value" stroke={isPeriodPositive ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)"} strokeWidth={2} fill="url(#pGrad)" dot={false} activeDot={{ r: 4, fill: isPeriodPositive ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Update prices a few times to see your portfolio trend</p>
                  </div>
                )}
              </div>
              {portfolioHistory.length >= 2 && (
                <div className="px-5 py-2.5 flex items-center justify-between border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{currentPeriod} change</span>
                  <span className="text-xs font-semibold" style={{ color: isPeriodPositive ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
                    {isPeriodPositive ? "+" : ""}{fmt(Math.abs(periodGain))} ({periodGainPercent.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Holdings Table ── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                <span className="font-[family-name:var(--font-nunito)] text-base font-bold" style={{ color: "var(--text-primary)" }}>Holdings</span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{investments.length} assets</span>
              </div>
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_80px_90px_80px_32px] gap-3 px-5 py-2 text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border)" }}>
                <span>Asset</span>
                <span className="text-right">Value</span>
                <span className="text-right">Gain/Loss</span>
                <span className="text-right">Weight</span>
                <span />
              </div>
              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {allHoldings.map((inv) => {
                  const gain = inv.purchase_value_cents ? inv.current_value_cents - inv.purchase_value_cents : null;
                  const gainPct = inv.purchase_value_cents && inv.purchase_value_cents > 0 ? (gain! / inv.purchase_value_cents) * 100 : null;
                  const isPos = gain !== null && gain >= 0;
                  const weight = totalValue > 0 ? (inv.current_value_cents / totalValue) * 100 : 0;
                  return (
                    <Link key={inv.id} href={`/invest/${inv.id}`} className="group">
                      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_80px_90px_80px_32px] gap-3 items-center px-5 py-3 hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer">
                        {/* Name + metadata */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: `${ASSET_COLORS[inv.asset_type] || "var(--pastel-coral)"}20` }}>
                            {ASSET_ICON[inv.asset_type] || "\u{1F4B0}"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{inv.name}</p>
                            <div className="flex items-center gap-1.5">
                              {inv.ticker_symbol && <span className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>{inv.ticker_symbol}</span>}
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
                                {ASSET_LABEL[inv.asset_type] || inv.asset_type}
                              </span>
                            </div>
                          </div>
                        </div>
                        {/* Mobile: value + gain inline */}
                        <div className="md:hidden text-right">
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(inv.current_value_cents)}</p>
                          {gain !== null && (
                            <p className="text-[10px] font-medium" style={{ color: isPos ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
                              {isPos ? "+" : ""}{gainPct!.toFixed(1)}%
                            </p>
                          )}
                        </div>
                        {/* Desktop columns */}
                        <span className="hidden md:block text-sm font-semibold text-right" style={{ color: "var(--text-primary)" }}>{fmt(inv.current_value_cents)}</span>
                        <span className="hidden md:block text-sm text-right font-medium" style={{ color: gain !== null ? (isPos ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)") : "var(--text-tertiary)" }}>
                          {gain !== null ? `${isPos ? "+" : ""}${gainPct!.toFixed(1)}%` : "\u2014"}
                        </span>
                        <span className="hidden md:block text-sm text-right" style={{ color: "var(--text-secondary)" }}>{weight.toFixed(1)}%</span>
                        <div className="hidden md:flex items-center justify-end">
                          {inv.ticker_symbol && (
                            <button onClick={(e) => handleUpdatePrice(inv.id, e)} disabled={updatingPrices[inv.id]} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer" title="Refresh price">
                              <RefreshCw className={`h-3 w-3 ${updatingPrices[inv.id] ? "animate-spin" : ""}`} style={{ color: "var(--text-tertiary)" }} />
                            </button>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {/* Price errors */}
              {Object.entries(priceErrors).filter(([, v]) => v).map(([id, msg]) => {
                const inv = investments.find((i) => i.id === id);
                return <p key={id} className="text-[10px] px-5 py-1" style={{ color: "var(--pastel-coral-dark)" }}>{inv?.name}: {msg}</p>;
              })}
            </div>
          </motion.div>

          {/* ── Performance + Movers side-by-side ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden h-full" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="font-[family-name:var(--font-nunito)] text-base font-bold" style={{ color: "var(--text-primary)" }}>Performance</span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Total ROI</span>
                    <span className="text-sm font-semibold" style={{ color: performanceMetrics.totalROIPercent >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
                      {performanceMetrics.totalROIPercent >= 0 ? "+" : ""}{performanceMetrics.totalROIPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Total Gain</span>
                    <span className="text-sm font-semibold" style={{ color: performanceMetrics.totalGainCents >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
                      {performanceMetrics.totalGainCents >= 0 ? "+" : ""}{fmt(Math.abs(performanceMetrics.totalGainCents))}
                    </span>
                  </div>
                  {performanceMetrics.bestPerformer && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <div>
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Best</span>
                        <p className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>{performanceMetrics.bestPerformer.name}</p>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "var(--pastel-mint-dark)" }}>+{performanceMetrics.bestPerformer.gainPercent.toFixed(1)}%</span>
                    </div>
                  )}
                  {performanceMetrics.worstPerformer && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <div>
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Worst</span>
                        <p className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>{performanceMetrics.worstPerformer.name}</p>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "var(--pastel-coral-dark)" }}>{performanceMetrics.worstPerformer.gainPercent.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {(topMovers.gainers.length > 0 || topMovers.losers.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                <div className="border-0 shadow-sm rounded-2xl overflow-hidden h-full" style={{ backgroundColor: "var(--surface-elevated)" }}>
                  <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                    <span className="font-[family-name:var(--font-nunito)] text-base font-bold" style={{ color: "var(--text-primary)" }}>Movers</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {topMovers.gainers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-5 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{m.name}</p>
                          {m.ticker_symbol && <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{m.ticker_symbol}</p>}
                        </div>
                        <span className="text-sm font-semibold flex-shrink-0 ml-3" style={{ color: "var(--pastel-mint-dark)" }}>+{m.gainPercent.toFixed(1)}%</span>
                      </div>
                    ))}
                    {topMovers.losers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-5 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{m.name}</p>
                          {m.ticker_symbol && <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{m.ticker_symbol}</p>}
                        </div>
                        <span className="text-sm font-semibold flex-shrink-0 ml-3" style={{ color: "var(--pastel-coral-dark)" }}>{m.gainPercent.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Dividend Income (wider bar chart) ── */}
          {hasDividends && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4" style={{ color: "var(--pastel-mint-dark)" }} />
                    <span className="font-[family-name:var(--font-nunito)] text-base font-bold" style={{ color: "var(--text-primary)" }}>Investment Income</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold" style={{ color: "var(--pastel-mint-dark)" }}>{fmt(annualDividendTotal)}</span>
                    <span className="text-[10px] ml-1.5" style={{ color: "var(--text-tertiary)" }}>{fmt(monthlyDividendAvg)}/mo avg</span>
                  </div>
                </div>
                <div className="p-3">
                  <div className="h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dividendChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} stroke="none" tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} stroke="none" tickLine={false} tickFormatter={(v) => `$${v}`} />
                        <Tooltip content={<DividendTooltip />} />
                        <Bar dataKey="amount" fill="var(--pastel-mint)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Rebalancing ── */}
          {hasTargetAllocations && significantDeltas.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <Scale className="h-4 w-4" style={{ color: "var(--pastel-purple-dark)" }} />
                  <span className="font-[family-name:var(--font-nunito)] text-base font-bold" style={{ color: "var(--text-primary)" }}>Rebalancing</span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {significantDeltas.map((delta) => (
                    <div key={delta.assetType} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{ASSET_ICON[delta.assetType] || "\u{1F4B0}"}</span>
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{ASSET_LABEL[delta.assetType] || delta.assetType}</span>
                        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{delta.currentPercent.toFixed(0)}% → {delta.targetPercent.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: delta.isOverweight ? "var(--pastel-coral-light)" : "var(--pastel-mint-light)", color: delta.isOverweight ? "var(--pastel-coral-dark)" : "var(--pastel-mint-dark)" }}>
                          {delta.isOverweight ? "Over" : "Under"}
                        </span>
                        <span className="text-sm font-semibold" style={{ color: delta.isOverweight ? "var(--pastel-coral-dark)" : "var(--pastel-mint-dark)" }}>
                          {delta.isOverweight ? "\u2212" : "+"}{fmt(Math.abs(delta.deltaCents))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ═══ RIGHT COLUMN (sidebar) ═══ */}
        <div className="space-y-4 md:space-y-6">

          {/* ── Allocation Donut ── */}
          {donutData.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="font-[family-name:var(--font-nunito)] text-base font-bold" style={{ color: "var(--text-primary)" }}>Allocation</span>
                </div>
                <AllocationDonut data={donutData} total={totalAllocation} />
              </div>
            </motion.div>
          )}

          {/* ── Cross-links: FIRE + Budget ── */}
          {fireProgress && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Link href="/plan" className="block group">
                <div className="border-0 shadow-sm rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer" style={{ backgroundColor: "var(--surface-elevated)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4" style={{ color: "var(--pastel-coral-dark)" }} />
                      <span className="font-[family-name:var(--font-nunito)] text-sm font-bold" style={{ color: "var(--text-primary)" }}>{fireLabel} FIRE</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" style={{ color: "var(--text-tertiary)" }} />
                  </div>
                  <div className="flex items-end justify-between mb-1.5">
                    <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{fireProgress.progressPercent.toFixed(1)}%</span>
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{fmtCompact(fireProgress.currentTotalCents)} / {fmtCompact(fireProgress.fireNumberCents)}</span>
                  </div>
                  <Progress value={Math.min(fireProgress.progressPercent, 100)} className="h-1.5" indicatorColor="var(--pastel-coral-dark)" />
                </div>
              </Link>
            </motion.div>
          )}

          {budgetContributions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <Link href="/budget" className="block group">
                <div className="border-0 shadow-sm rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer" style={{ backgroundColor: "var(--surface-elevated)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" style={{ color: "var(--pastel-blue-dark)" }} />
                      <span className="font-[family-name:var(--font-nunito)] text-sm font-bold" style={{ color: "var(--text-primary)" }}>Budget → Invest</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" style={{ color: "var(--text-tertiary)" }} />
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{fmt(totalBudgetContribution)}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>allocated in {currentMonth}</p>
                </div>
              </Link>
            </motion.div>
          )}

          {/* ── Watchlist ── */}
          {watchlistItems.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <button onClick={() => setWatchlistOpen(!watchlistOpen)} className="w-full px-5 py-3.5 flex items-center justify-between border-b cursor-pointer" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" style={{ color: "var(--pastel-blue-dark)" }} />
                    <span className="font-[family-name:var(--font-nunito)] text-base font-bold" style={{ color: "var(--text-primary)" }}>Watchlist</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--pastel-blue-light)", color: "var(--pastel-blue-dark)" }}>{watchlistItems.length}</span>
                  </div>
                  {watchlistOpen ? <ChevronUp className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />}
                </button>
                <AnimatePresence>
                  {watchlistOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                        {watchlistItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between px-5 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-base">{ASSET_ICON[item.asset_type] || "\u{1F4B0}"}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{item.name}</p>
                                {item.ticker_symbol && <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{item.ticker_symbol}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {item.last_price_cents && <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(item.last_price_cents)}</span>}
                              {item.ticker_symbol && (
                                <button onClick={async () => { setWatchlistRefreshing((p) => ({ ...p, [item.id]: true })); await refreshWatchlistPrice(item.id); setWatchlistRefreshing((p) => ({ ...p, [item.id]: false })); router.refresh(); }} disabled={watchlistRefreshing[item.id]} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer">
                                  <RefreshCw className={`h-3 w-3 ${watchlistRefreshing[item.id] ? "animate-spin" : ""}`} style={{ color: "var(--pastel-blue-dark)" }} />
                                </button>
                              )}
                              <Link href={`/invest/add?name=${encodeURIComponent(item.name)}&ticker=${encodeURIComponent(item.ticker_symbol || "")}&type=${item.asset_type}`}>
                                <button className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"><Plus className="h-3 w-3" style={{ color: "var(--pastel-mint-dark)" }} /></button>
                              </Link>
                              <button onClick={async () => { setWatchlistDeleting((p) => ({ ...p, [item.id]: true })); await deleteWatchlistItem(item.id); setWatchlistDeleting((p) => ({ ...p, [item.id]: false })); router.refresh(); }} disabled={watchlistDeleting[item.id]} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer">
                                <Trash2 className="h-3 w-3" style={{ color: "var(--pastel-coral-dark)" }} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}
