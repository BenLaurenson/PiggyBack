"use client";

import {
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import type {
  HealthMetric,
  TrendDirection,
  MetricStatus,
} from "@/lib/plan-health-calculations";

// ============================================================================
// Config
// ============================================================================

const trendIcons: Record<
  TrendDirection,
  { Icon: typeof TrendingUp; label: string }
> = {
  up: { Icon: TrendingUp, label: "Trending up" },
  down: { Icon: TrendingDown, label: "Trending down" },
  flat: { Icon: Minus, label: "Stable" },
};

const statusDotColor: Record<MetricStatus, string> = {
  good: "var(--pastel-mint-dark)",
  warning: "var(--pastel-yellow-dark)",
  concern: "var(--pastel-coral-dark)",
};

// ============================================================================
// Component — Sidebar card with compact metric rows
// ============================================================================

interface FinancialHealthSnapshotProps {
  metrics: HealthMetric[];
}

export function FinancialHealthSnapshot({
  metrics,
}: FinancialHealthSnapshotProps) {
  if (metrics.length === 0) return null;

  return (
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
          Financial Health
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {metrics.map((metric) => {
          const dotColor = statusDotColor[metric.status];
          const trend = trendIcons[metric.trend];

          return (
            <div key={metric.id} className="flex items-center gap-3 px-5 py-3">
              <svg
                className="w-2 h-2 flex-shrink-0"
                viewBox="0 0 8 8"
                aria-hidden="true"
              >
                <circle cx="4" cy="4" r="4" fill={dotColor} />
              </svg>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {metric.label}
                </p>
                <p
                  className="text-xs line-clamp-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {metric.statusLabel}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className="text-sm font-bold font-[family-name:var(--font-nunito)] tabular-nums"
                  style={{ color: "var(--text-primary)" }}
                >
                  {metric.value}
                </span>
                <trend.Icon
                  className="w-3.5 h-3.5"
                  style={{ color: dotColor }}
                  aria-label={trend.label}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
