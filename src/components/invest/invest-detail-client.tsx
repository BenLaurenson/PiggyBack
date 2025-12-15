"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Edit,
  FileText,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { updateInvestmentPriceFromAPI } from "@/app/actions/investments";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

interface HistoryPoint {
  value_cents: number;
  recorded_at: string;
}

interface InvestDetailClientProps {
  investment: Investment;
  history: HistoryPoint[];
  currentPeriod: string;
  portfolioWeight: number;
  annualizedReturn: number;
}

const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "ALL"] as const;

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);

const ASSET_LABEL: Record<string, string> = { stock: "Stock", etf: "ETF", crypto: "Crypto", property: "Property", other: "Other" };

function DetailTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="px-3 py-2 rounded-lg shadow-lg" style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}>
      <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
        {d.fullDate ? new Date(d.fullDate).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" }) : d.date}
      </p>
      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{fmt(d.valueCents)}</p>
    </div>
  );
}

export function InvestDetailClient({
  investment,
  history,
  currentPeriod,
  portfolioWeight,
  annualizedReturn,
}: InvestDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const gain = investment.purchase_value_cents ? investment.current_value_cents - investment.purchase_value_cents : null;
  const gainPct = investment.purchase_value_cents && investment.purchase_value_cents > 0 ? (gain! / investment.purchase_value_cents) * 100 : null;
  const hasGain = gain !== null;
  const isPositive = gain !== null && gain >= 0;

  const chartData = history.map((h) => ({
    date: new Date(h.recorded_at).toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
    value: h.value_cents / 100,
    fullDate: h.recorded_at,
    valueCents: h.value_cents,
  }));

  const firstValue = history[0]?.value_cents || investment.current_value_cents;
  const lastValue = investment.current_value_cents;
  const historicalGain = lastValue - firstValue;
  const historicalGainPercent = firstValue > 0 ? (historicalGain / firstValue) * 100 : 0;
  const isPeriodPositive = historicalGain >= 0;

  const daysSincePurchase = Math.max(1, Math.floor((new Date().getTime() - new Date(investment.created_at).getTime()) / (1000 * 60 * 60 * 24)));

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`/invest/${investment.id}?${params.toString()}`);
  };

  const handleRefreshPrice = async () => {
    setRefreshing(true);
    setRefreshError("");
    const result = await updateInvestmentPriceFromAPI(investment.id);
    if (result.error) setRefreshError(result.error);
    else router.refresh();
    setRefreshing(false);
  };

  // Build stats list
  const stats = [
    ...(investment.purchase_value_cents ? [{ label: "Purchase Cost", value: fmt(investment.purchase_value_cents), color: "var(--text-primary)" }] : []),
    ...(investment.quantity ? [{ label: "Quantity", value: String(investment.quantity), color: "var(--text-primary)" }] : []),
    { label: "Portfolio Weight", value: `${portfolioWeight.toFixed(1)}%`, color: "var(--pastel-blue-dark)" },
    {
      label: daysSincePurchase >= 365 ? "Annualized Return" : "Total Return",
      value: `${annualizedReturn >= 0 ? "+" : ""}${annualizedReturn.toFixed(1)}%`,
      color: annualizedReturn >= 0 ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)",
    },
    { label: "Days Held", value: daysSincePurchase.toLocaleString(), color: "var(--text-primary)" },
    { label: "Last Updated", value: new Date(investment.updated_at).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" }), color: "var(--text-primary)" },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>

      {/* ─── Breadcrumb + header ─── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <Link href="/invest" className="text-sm flex items-center gap-1 hover:gap-2 transition-all mb-3 cursor-pointer" style={{ color: "var(--text-tertiary)" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Investing
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
                {ASSET_LABEL[investment.asset_type] || investment.asset_type}
              </span>
              {investment.ticker_symbol && (
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{investment.ticker_symbol}</span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-bold truncate" style={{ color: "var(--text-primary)" }}>{investment.name}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {investment.ticker_symbol && (
              <Button onClick={handleRefreshPrice} disabled={refreshing} variant="outline" className="rounded-xl border-0 shadow-sm text-sm" style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-secondary)" }}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Updating" : "Refresh"}
              </Button>
            )}
            <Link href={`/invest/${investment.id}/edit`}>
              <Button className="rounded-xl border-0 shadow-sm text-sm" style={{ backgroundColor: "var(--pastel-blue)", color: "white" }}>
                <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Refresh error */}
      {refreshError && (
        <div className="mb-4 px-4 py-2 rounded-xl text-sm" style={{ backgroundColor: "var(--pastel-coral-light)", color: "var(--pastel-coral-dark)" }}>
          {refreshError}
        </div>
      )}

      {/* ─── Main 2-column layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

        {/* ═══ LEFT: Chart + period change ═══ */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">

          {/* Value + Chart */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Current Value</p>
                    <div className="text-3xl md:text-4xl font-bold" style={{ color: "var(--text-primary)" }}>{fmt(investment.current_value_cents)}</div>
                    {hasGain && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {isPositive ? <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--pastel-mint-dark)" }} /> : <TrendingDown className="h-3.5 w-3.5" style={{ color: "var(--pastel-coral-dark)" }} />}
                        <span className="text-sm font-medium" style={{ color: isPositive ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
                          {isPositive ? "+" : ""}{fmt(Math.abs(gain!))} ({gainPct!.toFixed(1)}%) all time
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Period pills */}
                  <div className="flex gap-1 flex-shrink-0">
                    {PERIODS.map((p) => (
                      <button
                        key={p}
                        onClick={() => handlePeriodChange(p)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer"
                        style={{ backgroundColor: currentPeriod === p ? "var(--pastel-blue)" : "transparent", color: currentPeriod === p ? "white" : "var(--text-tertiary)" }}
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
                      <AreaChart data={chartData} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isPeriodPositive ? "var(--pastel-mint)" : "var(--pastel-coral)"} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={isPeriodPositive ? "var(--pastel-mint)" : "var(--pastel-coral)"} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} stroke="none" tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} stroke="none" tickLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} width={55} />
                        <Tooltip content={<DetailTooltip />} />
                        <Area type="monotone" dataKey="value" stroke={isPeriodPositive ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)"} strokeWidth={2} fill="url(#dGrad)" dot={false} activeDot={{ r: 4, fill: isPeriodPositive ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Update the price a few times to see value over time</p>
                  </div>
                )}
              </div>

              {history.length >= 2 && (
                <div className="px-5 py-2.5 flex items-center justify-between border-t" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{currentPeriod} change</span>
                  <span className="text-xs font-semibold" style={{ color: isPeriodPositive ? "var(--pastel-mint-dark)" : "var(--pastel-coral-dark)" }}>
                    {isPeriodPositive ? "+" : ""}{fmt(Math.abs(historicalGain))} ({historicalGainPercent.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* ═══ RIGHT: Stats sidebar ═══ */}
        <div className="space-y-4 md:space-y-6">

          {/* Key stats */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Details</span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {stats.map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between px-5 py-3">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{stat.label}</span>
                    <span className="text-sm font-semibold" style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Notes */}
          {investment.notes && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <FileText className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
                  <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Notes</span>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-secondary)" }}>{investment.notes}</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
