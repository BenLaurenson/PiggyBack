"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  PiggyBank,
  Scissors,
  Shuffle,
  ChevronDown,
  Check,
  Settings,
  Flame,
  Info,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { FireProjectionChart } from "@/components/plan/fire-projection-chart";
import { FireWhatIf } from "@/components/plan/fire-what-if";
import { TwoBucketChart } from "@/components/plan/two-bucket-chart";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  generateProjectionData,
  FIRE_MULTIPLIER,
  FAT_FIRE_MULTIPLIER,
  type FireResult,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
} from "@/lib/fire-calculations";
import type {
  FireGameplan,
  GameplanAction,
  FireMilestone,
  CoastFireData,
  SavingsRatePoint,
  WithdrawalComparison,
} from "@/lib/fire-gameplan";

// ============================================================================
// Formatting
// ============================================================================

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const formatCompact = (cents: number) => {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  return `$${Math.round(dollars)}`;
};

// ============================================================================
// Main Component
// ============================================================================

interface FireGameplanPageProps {
  fireResult: FireResult;
  fireProfile: FireProfile;
  spending: SpendingData;
  investments: InvestmentData;
  currentAge: number;
  savingsRate: number;
  gameplan: FireGameplan;
}

export function FireGameplanPage({
  fireResult,
  fireProfile,
  spending,
  investments,
  currentAge,
  savingsRate,
  gameplan,
}: FireGameplanPageProps) {
  const [extraSavings, setExtraSavings] = useState(0);
  const [extraIncome, setExtraIncome] = useState(0);

  // Recompute projection when sliders change (same logic as old FireTabContent)
  const { projectionData, fireTargetCents } = useMemo(() => {
    if (extraSavings === 0 && extraIncome === 0) {
      return {
        projectionData: fireResult.projectionData,
        fireTargetCents: fireResult.fireNumberCents,
      };
    }

    const modifiedSpending: SpendingData = {
      ...spending,
      monthlyTotalSpendCents: Math.max(
        0,
        spending.monthlyTotalSpendCents - extraSavings * 100
      ),
      monthlyIncomeCents: spending.monthlyIncomeCents + extraIncome * 100,
    };

    let annualExpenses = fireResult.annualExpensesCents;
    if (extraSavings > 0) {
      const variant = fireProfile.fireVariant;
      if (variant === "lean") {
        annualExpenses = fireResult.annualExpensesCents;
      } else if (variant === "fat") {
        annualExpenses = Math.round(
          modifiedSpending.monthlyTotalSpendCents * 12 * FAT_FIRE_MULTIPLIER
        );
      } else {
        annualExpenses = modifiedSpending.monthlyTotalSpendCents * 12;
      }
    }

    const newFireNumber = annualExpenses * FIRE_MULTIPLIER;

    return {
      projectionData: generateProjectionData(
        currentAge,
        fireProfile,
        modifiedSpending,
        investments,
        annualExpenses,
        newFireNumber
      ),
      fireTargetCents: newFireNumber,
    };
  }, [
    extraSavings,
    extraIncome,
    fireResult,
    fireProfile,
    spending,
    investments,
    currentAge,
  ]);

  const monthlySavings = Math.max(
    0,
    spending.monthlyIncomeCents - spending.monthlyTotalSpendCents
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ══════════════════════════════════════════════════════════
          1. STATUS BANNER
      ══════════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.02 }}
        className="border-0 shadow-sm rounded-2xl px-5 py-6"
        style={{
          backgroundColor:
            gameplan.status === "on-track"
              ? "var(--pastel-mint-light)"
              : gameplan.status === "gap"
                ? "var(--pastel-yellow-light)"
                : "var(--pastel-coral-light)",
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p
              className="text-[10px] font-medium uppercase tracking-wider mb-1"
              style={{
                color:
                  gameplan.status === "on-track"
                    ? "var(--pastel-mint-dark)"
                    : gameplan.status === "gap"
                      ? "var(--pastel-yellow-dark)"
                      : "var(--pastel-coral-dark)",
              }}
            >
              {gameplan.status === "on-track"
                ? "On track"
                : gameplan.status === "gap"
                  ? "Gap detected"
                  : "Action needed"}
            </p>
            <h2
              className="text-xl font-bold font-[family-name:var(--font-nunito)]"
              style={{ color: "var(--text-primary)" }}
            >
              {gameplan.statusSummary}
            </h2>
          </div>
          <span
            className="text-sm font-semibold font-[family-name:var(--font-nunito)]"
            style={{ color: "var(--text-secondary)" }}
          >
            {gameplan.targetLabel}
          </span>
        </div>

        {/* Full-width progress bar */}
        <div className="mb-2">
          <div
            className="h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.08)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                backgroundColor:
                  gameplan.status === "on-track"
                    ? "var(--pastel-mint-dark)"
                    : gameplan.status === "gap"
                      ? "var(--pastel-yellow-dark)"
                      : "var(--pastel-coral-dark)",
              }}
              initial={{ width: "0%" }}
              animate={{
                width: `${Math.min(100, gameplan.progressPercent)}%`,
              }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {gameplan.progressPercent.toFixed(0)}% of FIRE number
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {fireResult.projectedFireAge !== null
              ? `FIRE by age ${fireResult.projectedFireAge}`
              : "Not yet projected"}
          </p>
        </div>
      </motion.section>

      {/* ══════════════════════════════════════════════════════════
          2. YOUR NUMBERS
      ══════════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="border-0 shadow-sm rounded-2xl"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div
          className="px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            Your numbers
          </p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 p-5">
          <NumberStat label="Current Age" value={String(currentAge)} />
          <NumberStat
            label="FIRE Age"
            value={
              fireResult.projectedFireAge !== null
                ? String(fireResult.projectedFireAge)
                : "\u2014"
            }
          />
          <NumberStat
            label="Years to Go"
            value={
              fireResult.yearsToFire !== null
                ? String(fireResult.yearsToFire)
                : "\u2014"
            }
          />
          <NumberStat
            label="Savings Rate"
            value={`${savingsRate.toFixed(0)}%`}
          />
          <NumberStat
            label="Monthly Savings"
            value={formatCompact(monthlySavings)}
          />
          <NumberStat
            label="FIRE Number"
            value={formatCompact(fireResult.fireNumberCents)}
          />
        </div>
      </motion.section>

      {/* ══════════════════════════════════════════════════════════
          3. YOUR GAMEPLAN
      ══════════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="border-0 shadow-sm rounded-2xl"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div
          className="px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            {"Here\u2019s your plan"}
          </p>
        </div>
        <div className="p-5 space-y-3">
          {gameplan.actions.map((action, i) => (
            <ActionStep key={action.type + i} action={action} step={i + 1} />
          ))}

          {/* ETF Suggestions */}
          <div
            className="mt-2 p-4 rounded-xl"
            style={{ backgroundColor: "var(--surface)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp
                className="w-3.5 h-3.5"
                style={{ color: "var(--pastel-mint-dark)" }}
              />
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Where to invest
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {gameplan.etfSuggestions.map((etf) => (
                <span
                  key={etf.ticker}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: "var(--surface-elevated)",
                    color: "var(--text-primary)",
                  }}
                >
                  <span className="font-bold">{etf.ticker}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>
                    {etf.type}
                  </span>
                </span>
              ))}
            </div>
            <p
              className="text-[10px] flex items-center gap-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              <Info className="w-3 h-3 flex-shrink-0" />
              General information only, not personal financial advice. Consider
              consulting a financial adviser.
            </p>
          </div>
        </div>
      </motion.section>

      {/* ══════════════════════════════════════════════════════════
          4. THE PATH FORWARD
      ══════════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="border-0 shadow-sm rounded-2xl"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            Your projection
          </p>
          {(extraSavings > 0 || extraIncome > 0) && (
            <span
              className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--pastel-mint-light)",
                color: "var(--pastel-mint-dark)",
              }}
            >
              What-if active
            </span>
          )}
        </div>
        <div className="p-5 space-y-6">
          <FireProjectionChart
            data={projectionData}
            fireTargetCents={fireTargetCents}
          />

          <div
            className="pt-5"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wider mb-4"
              style={{ color: "var(--text-tertiary)" }}
            >
              What if you saved more? Earned more?
            </p>
            <FireWhatIf
              fireResult={fireResult}
              profile={fireProfile}
              spending={spending}
              investments={investments}
              extraSavings={extraSavings}
              onExtraSavingsChange={setExtraSavings}
              extraIncome={extraIncome}
              onExtraIncomeChange={setExtraIncome}
            />
          </div>
        </div>
      </motion.section>

      {/* ══════════════════════════════════════════════════════════
          5. MILESTONES
      ══════════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="border-0 shadow-sm rounded-2xl"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div
          className="px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            FIRE milestones
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
          {gameplan.milestones.map((m) => (
            <MilestoneItem key={m.variant} milestone={m} />
          ))}
        </div>
      </motion.section>

      {/* ══════════════════════════════════════════════════════════
          6. DEEP DIVE
      ══════════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="border-0 shadow-sm rounded-2xl"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div
          className="px-5 py-3.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            Deep dive
          </p>
        </div>
        <div className="p-5 space-y-2">
          {/* Two-Bucket */}
          <DeepDiveSection title="Two-Bucket Strategy" subtitle="Super vs outside-super split">
            <TwoBucketChart bucket={fireResult.twoBucket} />
          </DeepDiveSection>

          {/* Savings Rate Power */}
          <DeepDiveSection
            title="Savings Rate Power"
            subtitle={
              gameplan.savingsRateImpact.plusTenYearsSaved !== null
                ? `+10% saves ~${gameplan.savingsRateImpact.plusTenYearsSaved} years`
                : "Higher rate = faster FIRE"
            }
          >
            <SavingsRateCurve points={gameplan.savingsRateCurve} />
          </DeepDiveSection>

          {/* Withdrawal Rates */}
          <DeepDiveSection
            title="Withdrawal Rate Impact"
            subtitle="Lower rate = safer for 50+ year retirement"
          >
            <WithdrawalRateTable comparison={gameplan.withdrawalComparison} />
          </DeepDiveSection>

          {/* Coast FIRE */}
          <DeepDiveSection
            title="Coast FIRE"
            subtitle={
              gameplan.coastFire.isAchieved
                ? "Achieved!"
                : `${gameplan.coastFire.progressPercent.toFixed(0)}% there`
            }
          >
            <CoastFireDetail data={gameplan.coastFire} />
          </DeepDiveSection>
        </div>
      </motion.section>

      {/* ══════════════════════════════════════════════════════════
          7. SETTINGS STRIP
      ══════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.22 }}
        className="flex items-center justify-between px-4 py-3 rounded-2xl border-0 shadow-sm"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Flame
            className="w-4 h-4 text-orange-500 flex-shrink-0"
            aria-hidden="true"
          />
          <p
            className="text-xs truncate"
            style={{ color: "var(--text-tertiary)" }}
          >
            {fireProfile.fireVariant.charAt(0).toUpperCase() +
              fireProfile.fireVariant.slice(1)}{" "}
            FIRE
            {" \u00B7 "}
            {fireProfile.outsideSuperReturnRate != null
              ? `${fireProfile.outsideSuperReturnRate}% outside / ${fireProfile.expectedReturnRate}% super`
              : `${fireProfile.expectedReturnRate}% return`}
            {fireProfile.incomeGrowthRate > 0 &&
              ` \u00B7 ${fireProfile.incomeGrowthRate}% income growth`}
            {fireProfile.spendingGrowthRate > 0 &&
              ` \u00B7 ${fireProfile.spendingGrowthRate}% inflation`}
            {" \u00B7 "}
            {fireProfile.superContributionRate}% SG
          </p>
        </div>
        <Link
          href="/settings/fire"
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors flex-shrink-0"
          style={{
            backgroundColor: "var(--surface-elevated)",
            color: "var(--text-secondary)",
          }}
        >
          <Settings className="w-3 h-3" aria-hidden="true" />
          Edit
        </Link>
      </motion.div>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function NumberStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </p>
      <p
        className="text-lg font-bold font-[family-name:var(--font-nunito)]"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

const actionIcons: Record<string, typeof TrendingUp> = {
  "save-invest": PiggyBank,
  "earn-more": TrendingUp,
  "cut-spending": Scissors,
  "switch-variant": Shuffle,
};

const priorityStyles: Record<
  string,
  { bg: string; border: string; numBg: string; numText: string }
> = {
  primary: {
    bg: "var(--surface-elevated)",
    border: "2px solid var(--pastel-mint)",
    numBg: "var(--pastel-mint)",
    numText: "white",
  },
  secondary: {
    bg: "var(--surface-elevated)",
    border: "1px solid var(--border)",
    numBg: "var(--surface)",
    numText: "var(--text-secondary)",
  },
  alternative: {
    bg: "var(--surface)",
    border: "1px dashed var(--border)",
    numBg: "var(--surface-elevated)",
    numText: "var(--text-tertiary)",
  },
};

function ActionStep({
  action,
  step,
}: {
  action: GameplanAction;
  step: number;
}) {
  const Icon = actionIcons[action.type] || TrendingUp;
  const style = priorityStyles[action.priority] || priorityStyles.secondary;

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl transition-all"
      style={{ backgroundColor: style.bg, border: style.border }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
        style={{ backgroundColor: style.numBg, color: style.numText }}
      >
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: "var(--text-tertiary)" }}
          />
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {action.headline}
          </p>
        </div>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {action.detail}
        </p>
        {action.impactYears !== null && action.impactYears > 0 && (
          <span
            className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--pastel-mint-light)",
              color: "var(--pastel-mint-dark)",
            }}
          >
            Saves {action.impactYears} {action.impactYears === 1 ? "year" : "years"}
          </span>
        )}
      </div>
    </div>
  );
}

function MilestoneItem({ milestone }: { milestone: FireMilestone }) {
  return (
    <div
      className="p-3 rounded-xl text-center transition-all"
      style={{
        backgroundColor: milestone.isCurrent
          ? "var(--surface-elevated)"
          : "var(--surface)",
        border: milestone.isCurrent
          ? "2px solid #f97316"
          : "2px solid transparent",
      }}
    >
      <div className="flex items-center justify-center gap-1 mb-1">
        {milestone.isAchieved && (
          <Check
            className="w-3 h-3"
            style={{ color: "var(--pastel-mint-dark)" }}
          />
        )}
        <p
          className="text-xs font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          {milestone.label}
        </p>
      </div>
      <p
        className="text-sm font-bold font-[family-name:var(--font-nunito)]"
        style={{ color: "var(--text-primary)" }}
      >
        {formatCompact(milestone.fireNumberCents)}
      </p>
      <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
        {milestone.projectedAge !== null
          ? `Age ${milestone.projectedAge}`
          : "\u2014"}
      </p>
      {/* Mini progress bar */}
      <div
        className="h-1 rounded-full mt-2 overflow-hidden"
        style={{ backgroundColor: "rgba(0,0,0,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${milestone.progressPercent}%`,
            backgroundColor: milestone.isAchieved
              ? "var(--pastel-mint-dark)"
              : milestone.progressPercent > 50
                ? "#f97316"
                : "var(--pastel-coral)",
          }}
        />
      </div>
      <p
        className="text-[10px] mt-1"
        style={{
          color: milestone.isAchieved
            ? "var(--pastel-mint-dark)"
            : "var(--text-tertiary)",
        }}
      >
        {milestone.isAchieved
          ? "Achieved"
          : `${milestone.progressPercent.toFixed(0)}%`}
      </p>
    </div>
  );
}

function DeepDiveSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[var(--surface)] transition-colors group cursor-pointer">
        <div className="text-left">
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {subtitle}
          </p>
        </div>
        <ChevronDown
          className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180"
          style={{ color: "var(--text-tertiary)" }}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Deep Dive Content Components
// ============================================================================

function SavingsRateCurveTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as SavingsRatePoint;
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs"
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
        {d.rate}% savings rate
      </p>
      <p style={{ color: "var(--pastel-mint-dark)" }}>
        {d.yearsToFire !== null ? `${d.yearsToFire} years to FIRE` : "Not projected"}
      </p>
    </div>
  );
}

function SavingsRateCurve({ points }: { points: SavingsRatePoint[] }) {
  const chartData = points.filter((p) => p.yearsToFire !== null);
  const currentPoint = chartData.find((p) => p.isCurrent);

  return (
    <div className="mt-2">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
          >
            <XAxis
              dataKey="rate"
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              dataKey="yearsToFire"
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}yr`}
            />
            <Tooltip content={<SavingsRateCurveTooltip />} />
            <Line
              type="monotone"
              dataKey="yearsToFire"
              stroke="var(--pastel-mint-dark)"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--pastel-mint-dark)",
                stroke: "white",
                strokeWidth: 2,
              }}
            />
            {currentPoint && (
              <ReferenceDot
                x={currentPoint.rate}
                y={currentPoint.yearsToFire!}
                r={6}
                fill="#f97316"
                stroke="white"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {currentPoint && (
        <p className="text-xs text-center mt-1" style={{ color: "var(--text-tertiary)" }}>
          You are at{" "}
          <span className="font-semibold" style={{ color: "#f97316" }}>
            {currentPoint.rate}%
          </span>
          {currentPoint.yearsToFire !== null &&
            ` — ${currentPoint.yearsToFire} years to FIRE`}
        </p>
      )}
    </div>
  );
}

function WithdrawalRateTable({
  comparison,
}: {
  comparison: WithdrawalComparison[];
}) {
  return (
    <div className="mt-2">
      <div className="grid grid-cols-3 gap-3">
        {comparison.map((c) => (
          <div
            key={c.rate}
            className="p-3 rounded-xl text-center"
            style={{ backgroundColor: "var(--surface)" }}
          >
            <p
              className="text-lg font-bold font-[family-name:var(--font-nunito)]"
              style={{ color: "var(--text-primary)" }}
            >
              {c.label}
            </p>
            <p
              className="text-sm font-semibold font-[family-name:var(--font-nunito)]"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatCompact(c.fireNumberCents)}
            </p>
            <p
              className="text-[10px] mt-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              {c.note}
            </p>
          </div>
        ))}
      </div>
      <p
        className="text-xs mt-3"
        style={{ color: "var(--text-tertiary)" }}
      >
        For 50+ year retirement (FIRE in your 30s-40s), consider 3.5% or lower
        withdrawal rate.
      </p>
    </div>
  );
}

function CoastFireDetail({ data }: { data: CoastFireData }) {
  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Coast FIRE number
          </p>
          <p
            className="text-lg font-bold font-[family-name:var(--font-nunito)]"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(data.coastNumberCents)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Current portfolio
          </p>
          <p
            className="text-lg font-bold font-[family-name:var(--font-nunito)]"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(data.currentPortfolioCents)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--surface)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${data.progressPercent}%`,
              backgroundColor: data.isAchieved
                ? "var(--pastel-mint-dark)"
                : "#f97316",
            }}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          {data.description}
        </p>
      </div>
    </div>
  );
}
