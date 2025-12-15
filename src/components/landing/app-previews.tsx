"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  Sparkles,
  Bot,
  Zap,
  ArrowRight,
  TrendingUp,
  Calendar,
  Shield,
  DollarSign,
  Settings2,
} from "lucide-react";
import { UpBankLogo } from "./up-bank-logo";

// ============================================================================
// Shared Utilities
// ============================================================================

const formatAUD = (amount: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount);

function ChartTooltip({ x, y, visible, children }: { x: number; y: number; visible: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute z-10 pointer-events-none rounded-lg shadow-lg text-xs px-2.5 py-1.5"
          style={{
            left: x,
            top: y,
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            transform: "translate(-50%, -100%)",
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function useCountUp(target: number, duration: number, enabled: boolean) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) { setValue(0); return; }
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled]);

  return value;
}

const fadeUp = (delay: number) => ({
  initial: { y: 15, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { duration: 0.4, delay, ease: "easeOut" as const },
});

// ============================================================================
// 0. DashboardOverviewPreview -- Matches real /home dashboard layout
// ============================================================================

function NetFlowMiniChart({ inView }: { inView: boolean }) {
  const data = [
    { income: 85, spending: 62 },
    { income: 85, spending: 70 },
    { income: 85, spending: 58 },
    { income: 90, spending: 82 },
    { income: 85, spending: 65 },
    { income: 85, spending: 40 },
  ];
  const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  const incomeAmounts = [4250, 4250, 4250, 4500, 4250, 4250];
  const spendingAmounts = [3100, 3500, 2900, 4100, 3250, 2000];
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="relative">
      <div className="flex items-end gap-1 h-10">
        {data.map((d, i) => (
          <div
            key={months[i]}
            className="flex-1 flex gap-px items-end cursor-pointer"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <motion.div
              className="flex-1 rounded-t-sm"
              style={{ backgroundColor: "var(--pastel-mint)", minHeight: "2px", opacity: hovered !== null && hovered !== i ? 0.4 : 1 }}
              initial={{ height: 0 }}
              animate={{ height: inView ? `${d.income}%` : 0 }}
              transition={{ duration: 0.4, delay: 0.3 + i * 0.05, ease: "easeOut" }}
            />
            <motion.div
              className="flex-1 rounded-t-sm"
              style={{ backgroundColor: "var(--pastel-coral)", minHeight: "2px", opacity: hovered !== null && hovered !== i ? 0.4 : 1 }}
              initial={{ height: 0 }}
              animate={{ height: inView ? `${d.spending}%` : 0 }}
              transition={{ duration: 0.4, delay: 0.35 + i * 0.05, ease: "easeOut" }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-0.5">
        {months.map(m => (
          <div key={m} className="flex-1 text-center">
            <span className="text-[7px]" style={{ color: "var(--text-tertiary)" }}>{m}</span>
          </div>
        ))}
      </div>
      <ChartTooltip
        x={hovered !== null ? ((hovered + 0.5) / data.length) * 100 : 0}
        y={-4}
        visible={hovered !== null}
      >
        {hovered !== null && (
          <div className="space-y-0.5 whitespace-nowrap">
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{months[hovered]}</p>
            <p style={{ color: "var(--pastel-mint-dark)" }}>Income: ${incomeAmounts[hovered].toLocaleString()}</p>
            <p style={{ color: "var(--pastel-coral-dark)" }}>Spending: ${spendingAmounts[hovered].toLocaleString()}</p>
          </div>
        )}
      </ChartTooltip>
    </div>
  );
}

function SpendingAreaChart({ inView }: { inView: boolean }) {
  const raw = [0, 45, 82, 120, 185, 210, 290, 350, 380, 420, 460, 510, 540, 580];
  const w = 100, h = 36;
  const points = raw.map((v, i) => ({ x: (i / (raw.length - 1)) * w, y: h - (v / 600) * h }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${w} ${h} L 0 ${h} Z`;
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const pathLength = 200;

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="w-full h-9">
        <defs>
          <linearGradient id="heroSpendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pastel-coral)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--pastel-coral)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <motion.path
          d={areaD}
          fill="url(#heroSpendGrad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.3, delay: 0.8 }}
        />
        <motion.path
          d={pathD}
          fill="none"
          stroke="var(--pastel-coral)"
          strokeWidth="1.5"
          strokeDasharray={pathLength}
          initial={{ strokeDashoffset: pathLength }}
          animate={{ strokeDashoffset: inView ? 0 : pathLength }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        />
        {/* Invisible hover rects */}
        {raw.map((v, i) => {
          const segW = w / raw.length;
          return (
            <rect
              key={i}
              x={i * segW}
              y={0}
              width={segW}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
        {/* Hover dot */}
        {hovered !== null && (
          <circle
            cx={points[hovered].x}
            cy={points[hovered].y}
            r="2"
            fill="var(--pastel-coral)"
            stroke="white"
            strokeWidth="1"
          />
        )}
      </svg>
      <ChartTooltip
        x={hovered !== null ? (points[hovered].x / w) * 100 : 0}
        y={-4}
        visible={hovered !== null}
      >
        {hovered !== null && (
          <div className="whitespace-nowrap">
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Day {hovered + 1}</p>
            <p style={{ color: "var(--pastel-coral-dark)" }}>${raw[hovered]}</p>
          </div>
        )}
      </ChartTooltip>
    </div>
  );
}

export function DashboardOverviewPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--background)" }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Welcome back, Ben!
        </p>
      </div>

      {/* Two Column Grid */}
      <div className="px-3 pb-3 grid grid-cols-5 gap-2">
        {/* LEFT COLUMN */}
        <div className="col-span-3 space-y-2">
          {/* Budget Card */}
          <motion.div className="rounded-lg shadow-sm p-3" style={{ backgroundColor: "var(--surface-elevated)" }} {...fadeUp(0)}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Budget</span>
                <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>February 2026</span>
              </div>
              <span className="text-[10px] flex items-center" style={{ color: "var(--pastel-blue-dark)" }}>
                View details <ChevronRight className="w-2.5 h-2.5" />
              </span>
            </div>
            <div className="mb-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>Income</span>
                <span className="text-[10px]" style={{ color: "var(--pastel-mint-dark)" }}>$8,500</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface-sunken)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: "var(--pastel-mint)" }}
                  initial={{ width: "0%" }}
                  animate={{ width: inView ? "100%" : "0%" }}
                  transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>Spent</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px]" style={{ color: "var(--text-primary)" }}>$3,420</span>
                  <span className="text-[9px]" style={{ color: "var(--pastel-mint-dark)" }}>$5,080 remaining</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface-sunken)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: "var(--pastel-blue)" }}
                  initial={{ width: "0%" }}
                  animate={{ width: inView ? "40%" : "0%" }}
                  transition={{ duration: 0.6, delay: 0.45, ease: "easeOut" }}
                />
              </div>
            </div>
            <div className="pt-1.5 border-t" style={{ borderColor: "var(--border)" }}>
              <p className="text-[9px] font-medium mb-1.5" style={{ color: "var(--text-tertiary)" }}>TOP SPENDING</p>
              <div className="space-y-1">
                {[
                  { icon: "🍽️", name: "Food & Dining", amount: "$420" },
                  { icon: "🏠", name: "Housing", amount: "$1,800" },
                  { icon: "🚗", name: "Transport", amount: "$280" },
                ].map(cat => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{cat.icon}</span>
                      <span className="text-[10px]" style={{ color: "var(--text-primary)" }}>{cat.name}</span>
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>{cat.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Net Worth Card */}
          <motion.div className="rounded-lg shadow-sm p-3" style={{ backgroundColor: "var(--surface-elevated)" }} {...fadeUp(0.1)}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>$48,200 net worth</span>
                <TrendingUp className="w-3 h-3" style={{ color: "var(--pastel-mint-dark)" }} />
                <span className="text-[10px] font-medium" style={{ color: "var(--pastel-mint-dark)" }}>+$5,080</span>
              </div>
              <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>4 accounts</span>
            </div>
            <NetFlowMiniChart inView={inView} />
            <div className="flex items-center justify-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: "var(--pastel-mint)" }} />
                <span className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>Income</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: "var(--pastel-coral)" }} />
                <span className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>Spending</span>
              </div>
            </div>
          </motion.div>

          {/* Goals Card */}
          <motion.div className="rounded-lg shadow-sm p-3" style={{ backgroundColor: "var(--surface-elevated)" }} {...fadeUp(0.2)}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Goals</span>
              <span className="text-[10px] flex items-center" style={{ color: "var(--pastel-purple-dark)" }}>
                View all <ChevronRight className="w-2.5 h-2.5" />
              </span>
            </div>
            <div className="space-y-1.5">
              {[
                { emoji: "🏠", name: "House Deposit", progress: 47, toGo: "$26,500", color: "#10b981" },
                { emoji: "✈️", name: "Japan Trip", progress: 64, toGo: "$1,800", color: "#6366f1" },
              ].map((goal, i) => (
                <div key={goal.name} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center text-xs" style={{ backgroundColor: `${goal.color}15` }}>
                    {goal.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>{goal.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-medium" style={{ color: goal.color }}>{goal.progress}%</span>
                        <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>{goal.toGo} to go</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface-sunken)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: goal.color }}
                        initial={{ width: "0%" }}
                        animate={{ width: inView ? `${goal.progress}%` : "0%" }}
                        transition={{ duration: 0.5, delay: 0.5 + i * 0.1, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-2 space-y-2">
          {/* Spending Card */}
          <motion.div className="rounded-lg shadow-sm p-3" style={{ backgroundColor: "var(--surface-elevated)" }} {...fadeUp(0.05)}>
            <div className="mb-1">
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Spending</span>
              <p className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>$3,420 this month</p>
            </div>
            <SpendingAreaChart inView={inView} />
          </motion.div>

          {/* Transactions Card */}
          <motion.div className="rounded-lg shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }} {...fadeUp(0.15)}>
            <div className="px-3 pt-2 pb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Transactions</span>
                <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>Most recent</span>
              </div>
              <span className="text-[9px] flex items-center" style={{ color: "var(--pastel-blue-dark)" }}>
                All <ChevronRight className="w-2 h-2" />
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {[
                { icon: "🛒", name: "Woolworths", category: "Groceries", amount: "-$45", color: "var(--text-primary)" },
                { icon: "☕", name: "Seven Seeds", category: "Coffee", amount: "-$6", color: "var(--text-primary)" },
                { icon: "💰", name: "Salary", category: "Income", amount: "+$4,250", color: "var(--pastel-mint-dark)" },
              ].map(txn => (
                <div key={txn.name} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-sm">{txn.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{txn.name}</p>
                    <p className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>{txn.category}</p>
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: txn.color }}>{txn.amount}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recurring Card */}
          <motion.div className="rounded-lg shadow-sm p-3" style={{ backgroundColor: "var(--surface-elevated)" }} {...fadeUp(0.25)}>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Recurring</span>
                <p className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>$172 due soon</p>
              </div>
              <span className="text-[9px] flex items-center" style={{ color: "var(--pastel-purple-dark)" }}>
                View all <ChevronRight className="w-2 h-2" />
              </span>
            </div>
            <div className="space-y-1">
              {[
                { icon: "📱", name: "Telstra", due: "In 3 days", amount: "$79" },
                { icon: "🎵", name: "Spotify", due: "In 5 days", amount: "$13" },
              ].map(bill => (
                <div key={bill.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{bill.icon}</span>
                    <div>
                      <p className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>{bill.name}</p>
                      <p className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>{bill.due}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: "var(--text-primary)" }}>{bill.amount}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">💰</span>
                <div>
                  <p className="text-[10px] font-medium" style={{ color: "var(--text-primary)" }}>Payday</p>
                  <p className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>In 5 days</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold" style={{ color: "var(--pastel-mint-dark)" }}>+$4,250</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 1. WebhookSyncPreview -- Real-Time Webhook Pipeline (already animated)
// ============================================================================

const SYNC_TRANSACTIONS = [
  {
    emoji: "🛒",
    merchant: "Woolworths",
    amount: -45.2,
    time: "Just now",
    badge: { label: "🍽️ Groceries", type: "categorized" as const },
  },
  {
    emoji: "☕",
    merchant: "Seven Seeds",
    amount: -5.5,
    time: "2m ago",
    badge: { label: "Coffee subscription", type: "bill-matched" as const },
  },
  {
    emoji: "💰",
    merchant: "Salary",
    amount: 4250.0,
    time: "8m ago",
    badge: { label: "Income matched", type: "income" as const },
  },
  {
    emoji: "❓",
    merchant: "J SMITH",
    amount: -25.0,
    time: "12m ago",
    badge: { label: "🍻 Pubs & Bars", type: "ai-categorized" as const },
  },
];

export function WebhookSyncPreview() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= SYNC_TRANSACTIONS.length) return prev;
        return prev + 1;
      });
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <UpBankLogo className="w-5 h-5" />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Up Bank
          </span>
          <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "var(--success-light)", color: "var(--success)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--success)" }} />
            Connected
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3" style={{ color: "var(--warning)" }} />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Webhooks active</span>
        </div>
      </div>

      {/* Transaction Feed */}
      <div className="px-4 py-3 space-y-2">
        <AnimatePresence>
          {SYNC_TRANSACTIONS.slice(0, visibleCount).map((tx, i) => (
            <motion.div
              key={tx.merchant}
              initial={{ opacity: 0, x: 20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex items-center justify-between py-2 px-3 rounded-lg"
              style={{ backgroundColor: i === 0 ? "var(--pastel-mint-light)" : "var(--surface-sunken)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{tx.emoji}</span>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {tx.merchant}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {tx.time}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: tx.amount > 0 ? "var(--success)" : "var(--text-primary)" }}
                >
                  {tx.amount > 0 ? "+" : ""}
                  {formatAUD(Math.abs(tx.amount))}
                </span>
                <TransactionBadge badge={tx.badge} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Status Bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 text-xs border-t"
        style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}
      >
        <span>3 accounts synced</span>
        <span>847 transactions · Last: 2s ago</span>
      </div>
    </div>
  );
}

function TransactionBadge({ badge }: { badge: { label: string; type: string } }) {
  const styles: Record<string, { bg: string; color: string; icon?: React.ReactNode }> = {
    categorized: {
      bg: "var(--success-light)",
      color: "var(--success)",
      icon: <Check className="w-3 h-3" />,
    },
    "bill-matched": {
      bg: "var(--info-light)",
      color: "var(--pastel-blue-dark)",
      icon: <Link2 className="w-3 h-3" />,
    },
    income: {
      bg: "var(--success-light)",
      color: "var(--success)",
      icon: <TrendingUp className="w-3 h-3" />,
    },
    "ai-categorized": {
      bg: "var(--accent-purple-light)",
      color: "var(--pastel-purple-dark)",
      icon: <Sparkles className="w-3 h-3" />,
    },
  };

  const s = styles[badge.type] || styles.categorized;

  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.icon}
      {badge.label}
    </span>
  );
}

// ============================================================================
// 2. BudgetPreview -- Matches real /budget page layout
// ============================================================================

const BUDGET_CATEGORIES = [
  { emoji: "🍽️", name: "Food & Dining", spent: 420, budget: 600 },
  { emoji: "🏠", name: "Housing", spent: 1800, budget: 1800 },
  { emoji: "🚗", name: "Transport", spent: 280, budget: 250 },
  { emoji: "📱", name: "Bills & Utilities", spent: 172, budget: 300 },
  { emoji: "🎮", name: "Entertainment", spent: 89, budget: 150 },
];

export function BudgetPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [activePeriod, setActivePeriod] = useState("monthly");
  const [activeView, setActiveView] = useState("shared");

  return (
    <div
      ref={ref}
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {["weekly", "fortnightly", "monthly"].map((p) => (
              <button
                key={p}
                onClick={() => setActivePeriod(p)}
                className="px-2 py-0.5 rounded text-xs transition-colors"
                style={{
                  backgroundColor: activePeriod === p ? "var(--pastel-blue-light)" : "transparent",
                  color: activePeriod === p ? "var(--pastel-blue-dark)" : "var(--text-tertiary)",
                  fontWeight: activePeriod === p ? 600 : 400,
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex rounded-full overflow-hidden text-xs" style={{ border: "1px solid var(--border)" }}>
            {["my", "shared"].map((v) => (
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className="px-2.5 py-0.5 transition-colors"
                style={{
                  backgroundColor: activeView === v ? "var(--brand-coral)" : "transparent",
                  color: activeView === v ? "white" : "var(--text-tertiary)",
                  fontWeight: activeView === v ? 600 : 400,
                }}
              >
                {v === "my" ? "My Budget" : "Our Budget"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TBB Card */}
      <div className="px-4 pt-3 pb-2">
        <motion.div
          className="rounded-lg px-4 py-2.5 text-center"
          style={{ backgroundColor: "var(--pastel-mint-light)" }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <p className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>To Be Budgeted</p>
          <p className="text-2xl font-black tabular-nums" style={{ color: "var(--success)" }}>$1,240</p>
        </motion.div>
      </div>

      {/* Category Table */}
      <div className="px-4 py-2 space-y-1">
        {BUDGET_CATEGORIES.map((cat, i) => {
          const pct = Math.round((cat.spent / cat.budget) * 100);
          const isOver = pct > 100;
          const remaining = cat.budget - cat.spent;
          const barColor = isOver ? "var(--pastel-coral)" : pct >= 90 ? "var(--warning)" : "var(--pastel-blue)";

          return (
            <motion.div
              key={cat.name}
              className="rounded-lg px-3 py-2"
              style={{ backgroundColor: "var(--surface-elevated)" }}
              initial={{ y: 15, opacity: 0 }}
              animate={inView ? { y: 0, opacity: 1 } : {}}
              transition={{ duration: 0.35, delay: 0.05 * i }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{cat.emoji}</span>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {cat.name}
                  </span>
                  <ChevronDown className="w-3 h-3" style={{ color: "var(--text-tertiary)" }} />
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums">
                  <span style={{ color: "var(--text-tertiary)" }}>${cat.budget}</span>
                  <span style={{ color: "var(--text-primary)" }}>${cat.spent}</span>
                  <span style={{ color: isOver ? "var(--pastel-coral-dark)" : "var(--pastel-mint-dark)" }}>
                    {isOver ? `-$${Math.abs(remaining)}` : `$${remaining}`}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface-sunken)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: barColor }}
                  initial={{ width: "0%" }}
                  animate={{ width: inView ? `${Math.min(pct, 100)}%` : "0%" }}
                  transition={{ duration: 0.5, delay: 0.3 + 0.05 * i, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="px-7 pb-2 flex items-center justify-end gap-3 text-[9px]" style={{ color: "var(--text-tertiary)" }}>
        <span>Assigned</span>
        <span>Spent</span>
        <span>Available</span>
      </div>
    </div>
  );
}

// ============================================================================
// 3. BillsPreview -- Matches real /plan page layout
// ============================================================================

const PLAN_EXPENSES = [
  { emoji: "📱", name: "Telstra", amount: 79, freq: "monthly", dueText: "15 Feb" },
  { emoji: "🏠", name: "Rent", amount: 950, freq: "fortnightly", dueText: "18 Feb" },
  { emoji: "🎵", name: "Spotify", amount: 12.99, freq: "monthly", dueText: "20 Feb" },
  { emoji: "⚡", name: "Origin Energy", amount: 85, freq: "quarterly", dueText: "1 Mar" },
];

export function BillsPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const statValues = [
    { target: 5, label: "Days Until Pay", prefix: "", suffix: "" },
    { target: 420, label: "Safe to Spend", prefix: "$", suffix: "" },
    { target: 5080, label: "Monthly Rate", prefix: "+$", suffix: "" },
    { target: 109, label: "Year End Proj.", prefix: "$", suffix: "k" },
  ];

  return (
    <div
      ref={ref}
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Plan</p>
          <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Financial projections & planning</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold border" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
          <Settings2 className="w-3 h-3" />
          Configure
        </div>
      </div>

      {/* Summary Stats Grid */}
      <div className="px-4 py-2 grid grid-cols-2 gap-2">
        {[
          { icon: <Calendar className="w-3 h-3" />, label: "Days Until Pay", value: "5", color: "var(--text-primary)" },
          { icon: <DollarSign className="w-3 h-3" />, label: "Safe to Spend", value: "$420", color: "var(--accent-teal)" },
          { icon: <span className="text-xs">📈</span>, label: "Monthly Rate", value: "+$5,080", color: "var(--text-primary)" },
          { icon: <span className="text-xs">🎯</span>, label: "Year End Proj.", value: "$109k", color: "var(--text-primary)" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className="rounded-xl p-2.5 border-2 shadow-sm"
            style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}
            initial={{ y: 15, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.35, delay: 0.05 * i }}
          >
            <div className="flex items-center gap-1 mb-0.5" style={{ color: "var(--text-secondary)" }}>
              {stat.icon}
              <span className="text-[9px]">{stat.label}</span>
            </div>
            <p className="text-lg font-black" style={{ color: stat.color }}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Upcoming Expenses */}
      <div className="px-4 py-2">
        <div className="rounded-xl p-3 border-2 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Upcoming Expenses</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-lg font-semibold" style={{ backgroundColor: "var(--info-light)", color: "var(--info)" }}>
              {PLAN_EXPENSES.length} active
            </span>
          </div>
          <div className="space-y-1.5">
            {PLAN_EXPENSES.slice(0, 3).map((exp, i) => (
              <motion.div
                key={exp.name}
                className="flex items-center justify-between p-2 rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "white" }}
                initial={{ x: 20, opacity: 0 }}
                animate={inView ? { x: 0, opacity: 1 } : {}}
                transition={{ duration: 0.35, delay: 0.2 + 0.08 * i }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base border" style={{ backgroundColor: "var(--pastel-purple-light)", borderColor: "var(--pastel-purple)" }}>
                    {exp.emoji}
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{exp.name}</p>
                    <p className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>Expected: {exp.dueText}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-lg font-semibold capitalize" style={{ backgroundColor: "var(--pastel-purple-light)", color: "var(--pastel-purple-dark)" }}>
                    {exp.freq}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{formatAUD(exp.amount)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. CouplesPreview -- Partnership Expense Splitting
// ============================================================================

const COUPLE_SPLITS = [
  { emoji: "🍽️", name: "Food & Dining", splitType: "50/50", benAmount: 210, sarahAmount: 210 },
  { emoji: "🏠", name: "Rent", splitType: "By income", benAmount: 551, sarahAmount: 399 },
  { emoji: "🎮", name: "Entertainment", splitType: "Personal", benAmount: 45, sarahAmount: null },
];

export function CouplesPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <div
      ref={ref}
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Our Budget
          </h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: "var(--pastel-coral-light)", color: "var(--pastel-coral-dark)" }}
          >
            Shared view
          </span>
        </div>
      </div>

      {/* Income Ratio Bar */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Income split
          </span>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Ben 58% · Sarah 42%
          </span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden">
          <motion.div
            style={{ backgroundColor: "var(--pastel-blue)" }}
            initial={{ width: "0%" }}
            animate={{ width: inView ? "58%" : "0%" }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          />
          <motion.div
            style={{ backgroundColor: "var(--pastel-coral)" }}
            initial={{ width: "0%" }}
            animate={{ width: inView ? "42%" : "0%" }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs font-medium" style={{ color: "var(--pastel-blue-dark)" }}>Ben</span>
          <span className="text-xs font-medium" style={{ color: "var(--pastel-coral-dark)" }}>Sarah</span>
        </div>
      </div>

      {/* Split Rows */}
      <div className="px-4 pb-2 space-y-1.5">
        {COUPLE_SPLITS.map((split, i) => (
          <motion.div
            key={split.name}
            className="rounded-lg px-3 py-2.5"
            style={{ backgroundColor: "var(--surface-sunken)" }}
            initial={{ y: 15, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.35, delay: 0.1 * i }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">{split.emoji}</span>
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {split.name}
                </span>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: split.splitType === "Personal"
                    ? "var(--surface-secondary)"
                    : "var(--pastel-mint-light)",
                  color: split.splitType === "Personal"
                    ? "var(--text-tertiary)"
                    : "var(--pastel-mint-dark)",
                }}
              >
                {split.splitType}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--pastel-blue-dark)" }}>
                Ben: ${split.benAmount}
              </span>
              {split.sarahAmount !== null && (
                <>
                  <span>·</span>
                  <span style={{ color: "var(--pastel-coral-dark)" }}>
                    Sarah: ${split.sarahAmount}
                  </span>
                </>
              )}
              {split.sarahAmount === null && (
                <span style={{ color: "var(--text-tertiary)" }}>Ben only</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* AI Analysis */}
      <motion.div
        className="px-4 py-3 border-t"
        style={{ borderColor: "var(--border)" }}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <div className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "var(--pastel-purple-dark)" }} />
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <span className="font-semibold">AI Split Analysis:</span> Ben is currently paying 62% of shared
            expenses vs 58% income share. Sarah could take on $34/mo more to balance.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// 5. AIAgentPreview -- 25-Tool AI Agent (already animated)
// ============================================================================

const TOOL_CHAIN = [
  { name: "getSubscriptionCostTrajectory", desc: "Analyzing 14 subscriptions..." },
  { name: "comparePeriods", desc: "Comparing last 3 months..." },
];

export function AIAgentPreview() {
  const [toolIndex, setToolIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setToolIndex((prev) => Math.min(prev + 1, TOOL_CHAIN.length));
    }, 800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
    >
      {/* Chat Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
            style={{ backgroundColor: "var(--pastel-purple-light)" }}
          >
            🐷
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Penny
            </span>
            <span className="text-xs ml-1.5" style={{ color: "var(--text-tertiary)" }}>
              29 financial tools
            </span>
          </div>
        </div>
        <Sparkles className="w-4 h-4" style={{ color: "var(--pastel-purple)" }} />
      </div>

      {/* Chat Messages */}
      <div className="px-4 py-3 space-y-3">
        {/* User message */}
        <div className="flex justify-end">
          <div
            className="rounded-2xl rounded-br-md px-3.5 py-2 max-w-[85%] text-sm"
            style={{ backgroundColor: "var(--pastel-blue-light)", color: "var(--text-primary)" }}
          >
            How much am I spending on subscriptions and is anything getting more expensive?
          </div>
        </div>

        {/* Tool Execution Chain */}
        <div className="space-y-1.5 pl-1">
          {TOOL_CHAIN.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: i < toolIndex ? 1 : 0.3, y: 0 }}
              className="flex items-center gap-2 text-xs"
            >
              {i < toolIndex ? (
                <Check className="w-3 h-3 flex-shrink-0" style={{ color: "var(--success)" }} />
              ) : (
                <div
                  className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                  style={{ borderColor: "var(--text-tertiary)" }}
                />
              )}
              <code
                className="font-mono px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "var(--surface-sunken)", color: "var(--text-secondary)", fontSize: "11px" }}
              >
                {tool.name}
              </code>
              <span style={{ color: "var(--text-tertiary)" }}>{tool.desc}</span>
            </motion.div>
          ))}
        </div>

        {/* Assistant Response */}
        <div
          className="rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed"
          style={{ backgroundColor: "var(--surface-sunken)", color: "var(--text-primary)" }}
        >
          You have <strong>14 active subscriptions</strong> costing{" "}
          <strong>$187/month</strong> ($2,244/year). Netflix increased from
          $16.99 to $22.99 (+35%) in January. Your subscription spending is up
          12% vs 6 months ago.
        </div>

        {/* Suggested Actions */}
        <div className="flex flex-wrap gap-1.5">
          {["Create subscription budget", "Show spending velocity", "Forecast next 3 months"].map(
            (action) => (
              <span
                key={action}
                className="text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer transition-colors"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  backgroundColor: "var(--surface-elevated)",
                }}
              >
                {action}
              </span>
            )
          )}
        </div>
      </div>

      {/* OpenClaw Badge */}
      <div
        className="px-4 py-2.5 border-t flex items-center gap-2"
        style={{ borderColor: "var(--border)" }}
      >
        <Bot className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} />
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Also available via OpenClaw bot integration
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 6. GoalsBentoPreview -- Matches real /goals page (2x1 bento card)
// ============================================================================

export function GoalsBentoPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const goals = [
    { emoji: "🏠", name: "House Deposit", current: 23500, target: 50000, color: "#10b981", daysLeft: 427, saverLinked: true },
    { emoji: "✈️", name: "Japan Trip", current: 3200, target: 5000, color: "#6366f1", daysLeft: 120, saverLinked: false },
  ];
  const totalCurrent = goals.reduce((s, g) => s + g.current, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const overallProgress = Math.round((totalCurrent / totalTarget) * 100);
  const animatedProgress = useCountUp(overallProgress, 0.8, inView);

  return (
    <div ref={ref} className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--background)" }}>
      {/* Purple hero */}
      <div className="px-4 pt-3 pb-2">
        <div className="rounded-xl p-4 text-center relative overflow-hidden" style={{ backgroundColor: "var(--accent-purple-light)" }}>
          <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{ backgroundColor: "var(--pastel-purple)" }} />
          <div className="absolute -bottom-3 -left-3 w-12 h-12 rounded-full opacity-15" style={{ backgroundColor: "var(--pastel-purple)" }} />
          <div className="relative">
            <p className="text-[10px] font-medium mb-0.5" style={{ color: "var(--pastel-purple-dark)" }}>Overall Progress</p>
            <p className="text-3xl font-black tabular-nums" style={{ color: "var(--pastel-purple-dark)" }}>{animatedProgress}%</p>
            <p className="text-[9px] mb-1.5" style={{ color: "var(--pastel-purple-dark)" }}>Complete across {goals.length} goals</p>
            <div className="h-2 rounded-full overflow-hidden mx-auto max-w-[200px]" style={{ backgroundColor: "rgba(255,255,255,0.5)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: "var(--pastel-mint-dark)" }}
                initial={{ width: "0%" }}
                animate={{ width: inView ? `${overallProgress}%` : "0%" }}
                transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
              />
            </div>
            <div className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.4)" }}>
              <Sparkles className="w-2.5 h-2.5" style={{ color: "var(--pastel-purple-dark)" }} />
              <span className="text-[9px] font-medium" style={{ color: "var(--pastel-purple-dark)" }}>
                ${((totalTarget - totalCurrent) / 1000).toFixed(1)}k remaining to save
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Goal cards */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        {goals.map((goal, i) => {
          const progress = Math.round((goal.current / goal.target) * 100);
          return (
            <motion.div
              key={goal.name}
              className="rounded-xl overflow-hidden border-0 shadow-sm"
              style={{ backgroundColor: "var(--surface-elevated)" }}
              initial={{ y: 15, opacity: 0 }}
              animate={inView ? { y: 0, opacity: 1 } : {}}
              transition={{ duration: 0.35, delay: 0.1 * i }}
            >
              {/* Top progress bar */}
              <div className="h-0.5 w-full" style={{ backgroundColor: "var(--surface-sunken)" }}>
                <motion.div
                  className="h-full"
                  style={{ backgroundColor: goal.color }}
                  initial={{ width: "0%" }}
                  animate={{ width: inView ? `${progress}%` : "0%" }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                />
              </div>
              <div className="p-2.5">
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: `${goal.color}20` }}>
                    {goal.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{goal.name}</p>
                    <div className="flex items-center gap-0.5">
                      <Calendar className="w-2.5 h-2.5" style={{ color: "var(--success)" }} />
                      <span className="text-[8px]" style={{ color: "var(--success)" }}>{goal.daysLeft} days left</span>
                    </div>
                    <span className="text-[8px] px-1 py-0.5 rounded inline-block mt-0.5" style={{
                      backgroundColor: goal.saverLinked ? "var(--pastel-blue-light)" : "var(--pastel-yellow-light)",
                      color: goal.saverLinked ? "var(--pastel-blue-dark)" : "var(--pastel-yellow-dark)",
                    }}>
                      {goal.saverLinked ? "🏦 Saver linked" : "No saver linked"}
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
                    ${(goal.current / 1000).toFixed(1)}k
                  </span>
                  <span className="text-sm font-black tabular-nums" style={{ color: goal.color }}>{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--surface-sunken)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: goal.color }}
                    initial={{ width: "0%" }}
                    animate={{ width: inView ? `${progress}%` : "0%" }}
                    transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[8px] mt-0.5 text-right" style={{ color: "var(--text-tertiary)" }}>of ${(goal.target / 1000).toFixed(0)}k</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 7. Categorization Before/After Preview
// ============================================================================

const CATEGORIZATION_EXAMPLES = [
  { merchant: "J SMITH", upCategory: "Uncategorized", piggyCategory: "🍻 Pubs & Bars", method: "AI" },
  { merchant: "AMZN MKTP", upCategory: "Shopping", piggyCategory: "🎮 Gaming", method: "Cache" },
  { merchant: "SQ *COFFEE", upCategory: "Restaurants", piggyCategory: "☕ Coffee", method: "AI" },
  { merchant: "PAYPAL *NETLF", upCategory: "Entertainment", piggyCategory: "📺 Streaming", method: "Cache" },
];

export function CategorizationPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <div
      ref={ref}
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--surface-elevated)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Smart Categorization
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: "var(--success-light)", color: "var(--success)" }}
        >
          2-pass system
        </span>
      </div>

      {/* Before/After Rows */}
      <div className="px-4 py-2 space-y-1">
        {CATEGORIZATION_EXAMPLES.map((ex, rowIdx) => (
          <motion.div
            key={ex.merchant}
            className="flex items-center justify-between py-2.5 px-3 rounded-lg"
            style={{ backgroundColor: "var(--surface-sunken)" }}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.15 * rowIdx }}
          >
            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.3, delay: 0.15 * rowIdx }}
            >
              <div className="text-left">
                <p className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                  {ex.merchant}
                </p>
                <p className="text-xs line-through" style={{ color: "var(--text-tertiary)" }}>
                  {ex.upCategory}
                </p>
              </div>
            </motion.div>
            <div className="flex items-center gap-2">
              <motion.div
                initial={{ opacity: 0, x: -5 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.25, delay: 0.15 * rowIdx + 0.1 }}
              >
                <ArrowRight className="w-3 h-3" style={{ color: "var(--text-tertiary)" }} />
              </motion.div>
              <motion.span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--success-light)", color: "var(--success)" }}
                initial={{ opacity: 0, x: 10 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.3, delay: 0.15 * rowIdx + 0.15 }}
              >
                {ex.piggyCategory}
              </motion.span>
              <motion.span
                className="text-xs px-1.5 py-0.5 rounded font-mono"
                style={{
                  backgroundColor: ex.method === "AI" ? "var(--accent-purple-light)" : "var(--pastel-blue-light)",
                  color: ex.method === "AI" ? "var(--pastel-purple-dark)" : "var(--pastel-blue-dark)",
                  fontSize: "10px",
                }}
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.25, delay: 0.15 * rowIdx + 0.2 }}
              >
                {ex.method === "AI" ? (
                  <span className="flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI
                  </span>
                ) : (
                  "Cache"
                )}
              </motion.span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer Stats */}
      <div
        className="px-4 py-2.5 border-t flex items-center justify-between text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}
      >
        <span>Merchant cache: 340 entries (instant, free)</span>
        <span>AI fallback: ≥0.5 confidence threshold</span>
      </div>
    </div>
  );
}

// ============================================================================
// Bento Grid Mini Components
// ============================================================================

const MERCHANT_MONTHS = [
  { month: "Sep", amount: 180 },
  { month: "Oct", amount: 210 },
  { month: "Nov", amount: 195 },
  { month: "Dec", amount: 260 },
  { month: "Jan", amount: 230 },
  { month: "Feb", amount: 185 },
];

export function MerchantDeepDiveMini() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const maxAmount = Math.max(...MERCHANT_MONTHS.map((m) => m.amount));
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div ref={ref} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛒</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Woolworths</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>47 visits · Last: 2 days ago</p>
          </div>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: "var(--pastel-mint-light)", color: "var(--pastel-mint-dark)" }}
        >
          🍽️ Groceries
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total", value: "$2,340" },
          { label: "Average", value: "$49.80" },
          { label: "This month", value: "$185" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className="rounded-lg p-2"
            style={{ backgroundColor: "var(--surface-sunken)" }}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.05 * i }}
          >
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{stat.label}</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{stat.value}</p>
          </motion.div>
        ))}
      </div>
      {/* Mini bar chart */}
      <div>
        <p className="text-[10px] mb-1" style={{ color: "var(--text-tertiary)" }}>Monthly spend</p>
        <div className="flex items-end gap-1 h-8 relative">
          {MERCHANT_MONTHS.map((m, i) => (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center gap-0.5 relative"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              <motion.div
                className="w-full rounded-sm"
                style={{
                  backgroundColor: "var(--pastel-mint)",
                  minHeight: "3px",
                  opacity: hovered !== null && hovered !== i ? 0.4 : 1,
                }}
                initial={{ height: 0 }}
                animate={{ height: inView ? `${(m.amount / maxAmount) * 100}%` : 0 }}
                transition={{ duration: 0.4, delay: 0.2 + 0.06 * i, ease: "easeOut" }}
              />
              <span className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>{m.month}</span>
            </div>
          ))}
          <ChartTooltip
            x={hovered !== null ? ((hovered + 0.5) / MERCHANT_MONTHS.length) * 100 : 0}
            y={-4}
            visible={hovered !== null}
          >
            {hovered !== null && (
              <div className="whitespace-nowrap">
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{MERCHANT_MONTHS[hovered].month}</p>
                <p style={{ color: "var(--pastel-mint-dark)" }}>${MERCHANT_MONTHS[hovered].amount}</p>
              </div>
            )}
          </ChartTooltip>
        </div>
      </div>
    </div>
  );
}

export function ThemesMini() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const themes = [
    { name: "Mint", bg: "var(--pastel-mint)", fg: "#1a1a2e", accent: "var(--pastel-mint-dark)" },
    { name: "Light", bg: "#fafafa", fg: "#1a1a2e", accent: "#e5e5e5" },
    { name: "Dark", bg: "#1a1a2e", fg: "#e5e5e5", accent: "#2d2d4e" },
    { name: "Ocean", bg: "var(--pastel-blue)", fg: "#1a1a2e", accent: "var(--pastel-blue-dark)" },
  ];

  return (
    <div ref={ref} className="space-y-3">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>4 Themes</p>
      <div className="grid grid-cols-2 gap-2">
        {themes.map((t, i) => (
          <motion.div
            key={t.name}
            className="rounded-lg p-2 border"
            style={{ backgroundColor: t.bg, borderColor: t.accent }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.08 * i }}
          >
            <div className="flex items-center gap-1 mb-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--pastel-coral)" }} />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--warning)" }} />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--success)" }} />
            </div>
            <div className="space-y-1">
              <div className="h-1 rounded-full w-3/4" style={{ backgroundColor: t.accent }} />
              <div className="h-1 rounded-full w-1/2" style={{ backgroundColor: t.accent }} />
            </div>
            <p className="text-[9px] mt-1.5 font-medium" style={{ color: t.fg }}>{t.name}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function ActivityMini() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const txns = [
    { emoji: "🛒", name: "Woolworths", cat: "Groceries", amount: "-$45.20", color: "var(--text-primary)" },
    { emoji: "☕", name: "Seven Seeds", cat: "Coffee", amount: "-$5.50", color: "var(--text-primary)" },
  ];

  return (
    <div ref={ref} className="space-y-2.5">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Activity</p>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "Spending", value: "$3,420", sub: "42 transactions", bgColor: "var(--pastel-coral-light)", fgColor: "var(--pastel-coral-dark)", dotColor: "var(--pastel-coral)" },
          { label: "Income", value: "$8,500", sub: "This Month", bgColor: "var(--pastel-mint-light)", fgColor: "var(--pastel-mint-dark)", dotColor: "var(--pastel-mint)" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            className="rounded-lg p-2 relative overflow-hidden"
            style={{ backgroundColor: card.bgColor }}
            initial={{ y: 15, opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.35, delay: i * 0.08 }}
          >
            <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full opacity-20" style={{ backgroundColor: card.dotColor }} />
            <p className="text-[9px] font-medium" style={{ color: card.fgColor }}>{card.label}</p>
            <p className="text-sm font-black tabular-nums" style={{ color: card.fgColor }}>{card.value}</p>
            <p className="text-[8px]" style={{ color: card.fgColor, opacity: 0.7 }}>{card.sub}</p>
          </motion.div>
        ))}
      </div>
      {/* Date-grouped transactions */}
      <div>
        <motion.div
          className="flex items-center gap-1.5 mb-1"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
          <span className="text-[8px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--pastel-coral-light)", color: "var(--text-tertiary)" }}>TODAY · -$51</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
        </motion.div>
        <div className="space-y-0.5">
          {txns.map((tx, i) => (
            <motion.div
              key={tx.name}
              className="flex items-center gap-1.5 py-1 px-1.5 rounded"
              style={{ backgroundColor: "var(--surface-sunken)" }}
              initial={{ x: 15, opacity: 0 }}
              animate={inView ? { x: 0, opacity: 1 } : {}}
              transition={{ duration: 0.3, delay: 0.2 + 0.06 * i }}
            >
              <span className="text-[10px]">{tx.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{tx.name}</p>
                <p className="text-[8px]" style={{ color: "var(--text-tertiary)" }}>{tx.cat}</p>
              </div>
              <span className="text-[10px] font-semibold tabular-nums" style={{ color: tx.color }}>{tx.amount}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InvestingMini() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const assets = [
    { emoji: "📈", name: "Stocks", count: 3, pct: 55, color: "var(--pastel-blue)", colorLight: "var(--pastel-blue-light)" },
    { emoji: "📊", name: "ETFs", count: 2, pct: 30, color: "var(--pastel-purple)", colorLight: "var(--accent-purple-light)" },
    { emoji: "₿", name: "Crypto", count: 1, pct: 15, color: "var(--pastel-yellow)", colorLight: "var(--pastel-yellow-light)" },
  ];

  const animatedValue = useCountUp(32450, 0.8, inView);

  return (
    <div ref={ref} className="space-y-2.5">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Investing</p>
      {/* Hero */}
      <motion.div
        className="rounded-lg p-2.5 text-center relative overflow-hidden"
        style={{ backgroundColor: "var(--pastel-mint-light)" }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.4 }}
      >
        <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full opacity-20" style={{ backgroundColor: "var(--pastel-mint)" }} />
        <div className="relative">
          <p className="text-[9px] font-medium" style={{ color: "var(--pastel-mint-dark)" }}>Total Portfolio</p>
          <p className="text-lg font-black tabular-nums" style={{ color: "var(--text-primary)" }}>${animatedValue.toLocaleString()}</p>
          <motion.div
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <TrendingUp className="w-2.5 h-2.5" style={{ color: "var(--pastel-mint-dark)" }} />
            <span className="text-[9px] font-medium" style={{ color: "var(--pastel-mint-dark)" }}>+$4,230 (15.0%)</span>
          </motion.div>
        </div>
      </motion.div>
      {/* Asset allocation */}
      <div className="space-y-1">
        {assets.map((a, i) => (
          <motion.div
            key={a.name}
            className="flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.1 * i }}
          >
            <span className="text-[10px]">{a.emoji}</span>
            <span className="text-[10px] flex-1" style={{ color: "var(--text-secondary)" }}>{a.name}</span>
            <span className="text-[9px] font-medium px-1 py-0.5 rounded" style={{ backgroundColor: a.colorLight, color: a.color }}>{a.count}</span>
            <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>{a.pct}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function OpenClawMini() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const lines = [
    { text: "$ claw ask piggyback", color: "#6b7280" },
    { text: '"How much did I spend on food?"', color: "#a5f3a5" },
    { text: "\u2192 $420 across 23 transactions", color: "#93c5fd" },
  ];
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (!inView) return;
    setVisibleLines(0);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count > lines.length) { clearInterval(interval); return; }
      setVisibleLines(count);
    }, 400);
    return () => clearInterval(interval);
  }, [inView]);

  return (
    <div ref={ref} className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4" style={{ color: "var(--pastel-purple-dark)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          OpenClaw Skill
        </p>
      </div>
      <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Query your PiggyBack data from any OpenClaw-compatible client — spending, budgets, goals, and insights.
      </p>
      <div
        className="rounded-lg px-2.5 py-2 font-mono text-[10px] leading-relaxed"
        style={{ backgroundColor: "#1a1a2e", color: "#a5f3a5", minHeight: "3.5em" }}
      >
        {lines.slice(0, visibleLines).map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            style={{ color: line.color }}
          >
            {line.text}
          </motion.p>
        ))}
      </div>
      <motion.a
        href="https://github.com/BenLaurenson/piggyback-skill"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[10px] font-semibold transition-colors hover:opacity-80"
        style={{ color: "var(--pastel-purple-dark)" }}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.3, delay: 1.4 }}
      >
        View on GitHub <ArrowRight className="w-3 h-3" />
      </motion.a>
    </div>
  );
}

export function MITLicenseMini() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const items = [
    { label: "Free forever", icon: "\u2713" },
    { label: "Fork & customise", icon: "\u2713" },
    { label: "No vendor lock-in", icon: "\u2713" },
  ];

  return (
    <div ref={ref} className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" style={{ color: "var(--pastel-mint-dark)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          MIT Licensed
        </p>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            className="flex items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.3, delay: 0.1 * i }}
          >
            <motion.span
              className="text-[10px] font-bold"
              style={{ color: "var(--success)" }}
              initial={{ scale: 0 }}
              animate={inView ? { scale: 1 } : {}}
              transition={{ duration: 0.3, delay: 0.1 * i, type: "spring", stiffness: 300 }}
            >
              {item.icon}
            </motion.span>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Sankey Bento Preview
// ============================================================================

const SANKEY_FLOWS = [
  { d: "M 12 15 C 60 15, 80 8, 140 8", stroke: "var(--pastel-coral)", strokeWidth: 6, label: "🍽️ Food & Dining", amount: "$420 (15%)", labelY: 8 },
  { d: "M 12 30 C 60 30, 80 25, 140 25", stroke: "var(--pastel-blue)", strokeWidth: 8, label: "🏠 Housing", amount: "$1,800 (64%)", labelY: 24 },
  { d: "M 12 48 C 60 48, 80 43, 140 43", stroke: "var(--pastel-yellow)", strokeWidth: 5, label: "🚗 Transport", amount: "$280 (10%)", labelY: 43 },
  { d: "M 12 62 C 60 62, 80 57, 140 57", stroke: "var(--pastel-purple)", strokeWidth: 4, label: "📱 Bills", amount: "$180 (6%)", labelY: 57 },
  { d: "M 12 72 C 60 72, 80 69, 140 69", stroke: "var(--pastel-lavender)", strokeWidth: 3, label: "🎮 Entertainment", amount: "$120 (4%)", labelY: 69 },
];

const SANKEY_BLOCKS = [
  { x: 140, y: 3, h: 12, fill: "var(--pastel-coral)" },
  { x: 140, y: 19, h: 14, fill: "var(--pastel-blue)" },
  { x: 140, y: 38, h: 10, fill: "var(--pastel-yellow)" },
  { x: 140, y: 52, h: 8, fill: "var(--pastel-purple)" },
  { x: 140, y: 64, h: 6, fill: "var(--pastel-lavender)" },
];

export function SankeyBentoPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [hovered, setHovered] = useState<number | null>(null);
  const pathLength = 200;

  return (
    <div ref={ref} className="space-y-2 relative">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Sankey Diagrams
        </p>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          D3-powered · February 2026
        </span>
      </div>
      <svg viewBox="0 0 280 80" className="w-full h-20">
        {/* Income block */}
        <rect x="0" y="5" width="12" height="70" rx="3" fill="var(--pastel-mint)" />
        <text x="2" y="42" fontSize="5" fill="white" fontWeight="bold" dominantBaseline="middle">$</text>

        {/* Flow curves */}
        {SANKEY_FLOWS.map((flow, i) => (
          <motion.path
            key={i}
            d={flow.d}
            stroke={flow.stroke}
            strokeWidth={flow.strokeWidth}
            fill="none"
            strokeDasharray={pathLength}
            initial={{ strokeDashoffset: pathLength }}
            animate={{ strokeDashoffset: inView ? 0 : pathLength }}
            transition={{ duration: 0.6, delay: 0.1 * i, ease: "easeOut" }}
            style={{
              opacity: hovered === null ? 0.5 : hovered === i ? 0.9 : 0.15,
              transition: "opacity 0.2s",
              cursor: "pointer",
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {/* Category blocks */}
        {SANKEY_BLOCKS.map((block, i) => (
          <motion.rect
            key={i}
            x={block.x}
            y={block.y}
            width="8"
            height={block.h}
            rx="2"
            fill={block.fill}
            initial={{ opacity: 0 }}
            animate={{ opacity: inView ? (hovered === null ? 1 : hovered === i ? 1 : 0.2) : 0 }}
            transition={{ duration: 0.3, delay: 0.1 * i + 0.3 }}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {/* Labels */}
        {SANKEY_FLOWS.map((flow, i) => (
          <g key={`label-${i}`}>
            <motion.text
              x="154"
              y={flow.labelY}
              fontSize="5.5"
              fontWeight="bold"
              fill="var(--text-secondary)"
              initial={{ opacity: 0 }}
              animate={{ opacity: inView ? (hovered === null ? 1 : hovered === i ? 1 : 0.2) : 0 }}
              transition={{ duration: 0.3, delay: 0.1 * i + 0.4 }}
            >
              {flow.label}
            </motion.text>
            <motion.text
              x="236"
              y={flow.labelY}
              fontSize="5"
              fill="var(--text-tertiary)"
              initial={{ opacity: 0 }}
              animate={{ opacity: inView ? (hovered === null ? 1 : hovered === i ? 1 : 0.2) : 0 }}
              transition={{ duration: 0.3, delay: 0.1 * i + 0.4 }}
            >
              {flow.amount}
            </motion.text>
          </g>
        ))}

        {/* Invisible hover zones per flow for better hit targets */}
        {SANKEY_FLOWS.map((flow, i) => (
          <path
            key={`hover-${i}`}
            d={flow.d}
            stroke="transparent"
            strokeWidth={Math.max(flow.strokeWidth * 2, 12)}
            fill="none"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute z-10 pointer-events-none rounded-lg shadow-lg text-xs px-2.5 py-1.5"
            style={{
              right: 8,
              top: 28,
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          >
            <p className="font-semibold">{SANKEY_FLOWS[hovered].label}</p>
            <p style={{ color: "var(--text-secondary)" }}>{SANKEY_FLOWS[hovered].amount}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
