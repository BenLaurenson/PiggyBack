"use client";

import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/budget-zero-calculations";
import { cn } from "@/lib/utils";
import type { CashFlowSummary } from "@/lib/expense-projections";

interface ExpenseCashFlowSummaryProps {
  summary: CashFlowSummary;
  className?: string;
}

export function ExpenseCashFlowSummary({
  summary,
  className,
}: ExpenseCashFlowSummaryProps) {
  const { thisMonth, nextMonth, shortfall } = summary;

  // Determine status for styling
  const isFullyCovered = shortfall === 0 && thisMonth.remaining === 0;
  const hasShortfall = shortfall > 0;

  return (
    <motion.div
      className={cn("px-3 py-3 space-y-3", className)}
      style={{ backgroundColor: "var(--muted)" }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{
            backgroundColor: hasShortfall
              ? "var(--pastel-coral-light)"
              : "var(--pastel-mint-light)",
          }}
        >
          {hasShortfall ? (
            <TrendingUp
              className="h-3.5 w-3.5"
              style={{ color: "var(--pastel-coral-dark)" }}
            />
          ) : (
            <CheckCircle2
              className="h-3.5 w-3.5"
              style={{ color: "var(--pastel-mint-dark)" }}
            />
          )}
        </div>
        <span
          className="font-[family-name:var(--font-dm-sans)] text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          Cash Flow
        </span>
      </div>

      {/* This Month Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span
            className="font-[family-name:var(--font-dm-sans)] text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            This Month
          </span>
          <span
            className="font-[family-name:var(--font-nunito)] text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(thisMonth.paid)} / {formatCurrency(thisMonth.total)}
          </span>
        </div>
        <Progress
          value={thisMonth.percentPaid}
          className="h-2"
          indicatorColor={
            thisMonth.percentPaid >= 100
              ? "var(--pastel-mint)"
              : thisMonth.percentPaid >= 50
              ? "var(--pastel-yellow)"
              : "var(--pastel-coral)"
          }
        />
        <div className="flex items-center justify-between">
          <span
            className="font-[family-name:var(--font-dm-sans)] text-[10px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            {thisMonth.percentPaid.toFixed(0)}% covered
          </span>
          {thisMonth.remaining > 0 && (
            <span
              className="font-[family-name:var(--font-dm-sans)] text-[10px] font-medium"
              style={{ color: "var(--pastel-coral-dark)" }}
            >
              {formatCurrency(thisMonth.remaining)} remaining
            </span>
          )}
        </div>
      </div>

      {/* Next Month Preview */}
      {nextMonth.total > 0 && (
        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <span
            className="font-[family-name:var(--font-dm-sans)] text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Next Month
          </span>
          <span
            className="font-[family-name:var(--font-nunito)] text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {formatCurrency(nextMonth.total)}
          </span>
        </div>
      )}

      {/* Shortfall Warning */}
      {hasShortfall && (
        <motion.div
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
          style={{ backgroundColor: "var(--pastel-coral-light)" }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <AlertTriangle
            className="h-3.5 w-3.5 flex-shrink-0"
            style={{ color: "var(--pastel-coral-dark)" }}
          />
          <span
            className="font-[family-name:var(--font-dm-sans)] text-xs font-medium"
            style={{ color: "var(--pastel-coral-dark)" }}
          >
            {formatCurrency(shortfall)} more needed this month
          </span>
        </motion.div>
      )}

      {/* All Covered Celebration */}
      {isFullyCovered && thisMonth.total > 0 && (
        <motion.div
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
          style={{ backgroundColor: "var(--pastel-mint-light)" }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <CheckCircle2
            className="h-3.5 w-3.5 flex-shrink-0"
            style={{ color: "var(--pastel-mint-dark)" }}
          />
          <span
            className="font-[family-name:var(--font-dm-sans)] text-xs font-medium"
            style={{ color: "var(--pastel-mint-dark)" }}
          >
            All expenses covered this month!
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
