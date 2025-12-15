"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  ChevronRight,
  X,
} from "lucide-react";
import type { PriorityRecommendation } from "@/lib/plan-health-calculations";

// ============================================================================
// Config
// ============================================================================

const priorityConfig: Record<
  string,
  { dot: string; text: string; bgColor: string; Icon: typeof AlertTriangle }
> = {
  high: {
    dot: "var(--pastel-coral-dark)",
    text: "var(--pastel-coral-dark)",
    bgColor: "var(--pastel-coral-light)",
    Icon: AlertTriangle,
  },
  medium: {
    dot: "var(--pastel-yellow-dark)",
    text: "var(--pastel-yellow-dark)",
    bgColor: "var(--pastel-yellow-light)",
    Icon: Lightbulb,
  },
  low: {
    dot: "var(--pastel-mint-dark)",
    text: "var(--pastel-mint-dark)",
    bgColor: "var(--pastel-mint-light)",
    Icon: CheckCircle2,
  },
};

// ============================================================================
// Component
// ============================================================================

interface PriorityRecommendationsProps {
  recommendations: PriorityRecommendation[];
}

export function PriorityRecommendations({
  recommendations,
}: PriorityRecommendationsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = recommendations.filter((r) => !dismissed.has(r.id));

  if (visible.length === 0) {
    return null;
  }

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
          Priority Actions
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {visible.map((rec) => {
          const config = priorityConfig[rec.priority] || priorityConfig.medium;

          return (
            <div
              key={rec.id}
              className="flex items-start gap-3 px-5 py-3 group"
            >
              <config.Icon
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                style={{ color: config.dot }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {rec.title}
                  </p>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: config.bgColor,
                      color: config.text,
                    }}
                  >
                    {rec.category}
                  </span>
                </div>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {rec.description}
                </p>
                {rec.actionHref && (
                  <Link
                    href={rec.actionHref}
                    className="inline-flex items-center gap-0.5 text-xs font-medium mt-1 hover:underline cursor-pointer"
                    style={{ color: config.text }}
                  >
                    View <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 flex-shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity cursor-pointer"
                onClick={() =>
                  setDismissed((prev) => new Set([...prev, rec.id]))
                }
                aria-label="Dismiss recommendation"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
