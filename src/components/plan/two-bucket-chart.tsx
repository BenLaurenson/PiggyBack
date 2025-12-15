"use client";

import { motion } from "framer-motion";
import type { TwoBucketBreakdown } from "@/lib/fire-calculations";

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

interface TwoBucketChartProps {
  bucket: TwoBucketBreakdown;
}

export function TwoBucketChart({ bucket }: TwoBucketChartProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <BucketBar
        label="Outside Super"
        sublabel={bucket.yearsPreRetirement > 0 ? `Covers ${bucket.yearsPreRetirement} years to age 60` : "Not needed before 60"}
        currentCents={bucket.outsideSuperCurrentCents}
        targetCents={bucket.outsideSuperTargetCents}
        percent={bucket.outsideSuperProgressPercent}
        color="#f97316"
        delay={0.3}
      />
      <BucketBar
        label="Super"
        sublabel="Covers retirement from age 60+"
        currentCents={bucket.superCurrentCents}
        targetCents={bucket.superTargetCents}
        percent={bucket.superProgressPercent}
        color="var(--pastel-mint)"
        delay={0.5}
      />
    </div>
  );
}

function BucketBar({
  label,
  sublabel,
  currentCents,
  targetCents,
  percent,
  color,
  delay,
}: {
  label: string;
  sublabel: string;
  currentCents: number;
  targetCents: number;
  percent: number;
  color: string;
  delay: number;
}) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {label}
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            {sublabel}
          </p>
        </div>
        <span
          className="text-sm font-bold font-[family-name:var(--font-nunito)]"
          style={{ color: "var(--text-primary)" }}
        >
          {clampedPercent.toFixed(0)}%
        </span>
      </div>
      <div
        className="h-4 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--surface)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: "0%" }}
          animate={{ width: `${clampedPercent}%` }}
          transition={{ duration: 1.2, ease: "easeOut", delay }}
        />
      </div>
      <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
        <span>{formatCurrency(currentCents)}</span>
        <span>{targetCents > 0 ? formatCurrency(targetCents) : "N/A"}</span>
      </div>
    </div>
  );
}
