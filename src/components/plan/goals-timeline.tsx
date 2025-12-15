"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Flag,
  Home,
  Baby,
  Briefcase,
  Plane,
  GraduationCap,
  Heart,
  Car,
  Palmtree,
  Building2,
  Wallet,
  Target,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { toggleGoalChecklistItem } from "@/app/actions/goals";
import type { GoalInteraction } from "@/lib/plan-health-calculations";

// ============================================================================
// Types
// ============================================================================

export interface GoalTimelineData {
  id: string;
  name: string;
  description: string | null;
  deadline: string;
  target_amount_cents: number;
  current_amount_cents: number;
  estimated_monthly_impact_cents: number;
  icon: string;
  color: string;
  is_completed: boolean;
  completed_at: string | null;
  preparation_checklist: { item: string; done: boolean }[];
  sort_order: number;
  linked_account_name: string | null;
}

// ============================================================================
// Icon Map
// ============================================================================

const goalIcons: Record<string, typeof Target> = {
  target: Target,
  home: Home,
  baby: Baby,
  briefcase: Briefcase,
  plane: Plane,
  "graduation-cap": GraduationCap,
  heart: Heart,
  car: Car,
  palmtree: Palmtree,
  building2: Building2,
  wallet: Wallet,
};

// ============================================================================
// Helpers
// ============================================================================

function getGoalStatus(
  deadline: string,
  isCompleted: boolean
): "completed" | "overdue" | "approaching" | "future" {
  if (isCompleted) return "completed";
  const now = new Date();
  const target = new Date(deadline);
  const sixMonths = new Date(now);
  sixMonths.setMonth(sixMonths.getMonth() + 6);

  if (target < now) return "overdue";
  if (target <= sixMonths) return "approaching";
  return "future";
}

const statusStyles: Record<
  string,
  { border: string; bg: string }
> = {
  completed: {
    border: "var(--pastel-mint)",
    bg: "var(--pastel-mint-light)",
  },
  overdue: {
    border: "var(--pastel-coral)",
    bg: "var(--pastel-coral-light)",
  },
  approaching: {
    border: "var(--pastel-yellow)",
    bg: "var(--pastel-yellow-light)",
  },
  future: {
    border: "var(--border)",
    bg: "var(--surface)",
  },
};

const formatCurrency = (cents: number): string =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString("en-AU", {
    month: "short",
    year: "numeric",
  });

// ============================================================================
// Component
// ============================================================================

interface GoalsTimelineProps {
  goals: GoalTimelineData[];
  interactions: GoalInteraction[];
}

export function GoalsTimeline({
  goals,
  interactions,
}: GoalsTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const sorted = [...goals].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  const interactionMap = new Map(
    interactions.map((i) => [i.goalId, i])
  );

  return (
    <div
      className="border-0 shadow-sm rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--surface-elevated)" }}
    >
      {/* Section header */}
      <div
        className="px-5 py-3.5 flex items-center justify-between border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="font-[family-name:var(--font-nunito)] text-base font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Goals Timeline
        </span>
        <Link
          href="/goals"
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors cursor-pointer hover:bg-[var(--surface-sunken)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <Flag className="w-3.5 h-3.5" />
          All Goals
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-8">
          <p
            className="text-sm mb-3"
            style={{ color: "var(--text-tertiary)" }}
          >
            No goals with deadlines yet
          </p>
          <Link href="/goals">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
            >
              <Target className="w-3.5 h-3.5 mr-1" />
              Create a goal
            </Button>
          </Link>
        </div>
      ) : (
        <div className="relative pl-12 pr-5 py-3">
          {/* Connecting line — centered on node circles (pl-12 - left-10 + w-8/2 = 1.5rem) */}
          <div
            className="absolute left-6 top-6 bottom-6 w-0.5"
            style={{ backgroundColor: "var(--border)" }}
          />

          {sorted.map((goal, i) => {
            const status = getGoalStatus(goal.deadline, goal.is_completed);
            const style = statusStyles[status];
            const Icon = goalIcons[goal.icon] || Target;
            const isExpanded = expandedId === goal.id;
            const interaction = interactionMap.get(goal.id);
            const checklistDone = goal.preparation_checklist.filter(
              (c) => c.done
            ).length;
            const checklistTotal = goal.preparation_checklist.length;
            const progressPercent =
              goal.target_amount_cents > 0
                ? Math.min(
                    100,
                    (goal.current_amount_cents / goal.target_amount_cents) * 100
                  )
                : 0;

            return (
              <div key={goal.id}>
                <motion.div
                  className="relative mb-4 last:mb-0"
                  initial={
                    shouldReduceMotion ? false : { opacity: 0, x: -10 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: shouldReduceMotion ? 0 : 0.05 * i }}
                >
                  {/* Node circle */}
                  <div
                    className="absolute -left-10 top-0.5 w-8 h-8 rounded-full flex items-center justify-center z-10 cursor-pointer"
                    style={{
                      border: `2px solid ${style.border}`,
                      backgroundColor: style.bg,
                    }}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : goal.id)
                    }
                    aria-label={`Goal: ${goal.name}, target ${formatDate(goal.deadline)}`}
                  >
                    {status === "completed" ? (
                      <Check
                        className="w-4 h-4"
                        style={{ color: "var(--pastel-mint-dark)" }}
                      />
                    ) : (
                      <Icon
                        className="w-3.5 h-3.5"
                        style={{ color: style.border }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div
                    className="py-2.5 cursor-pointer transition-colors duration-200 hover:bg-[var(--surface-sunken)] rounded-lg px-2 -mx-1"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : goal.id)
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {goal.name}
                          {status === "completed" && (
                            <span
                              className="text-xs font-normal ml-2"
                              style={{ color: "var(--pastel-mint-dark)" }}
                            >
                              Done
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {formatDate(goal.deadline)}
                          </span>
                          {goal.target_amount_cents > 0 && (
                            <span
                              className="text-xs tabular-nums"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {formatCurrency(goal.current_amount_cents)} / {formatCurrency(goal.target_amount_cents)}
                            </span>
                          )}
                          {goal.linked_account_name && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {goal.linked_account_name}
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: "var(--text-tertiary)" }}
                        />
                      ) : (
                        <ChevronDown
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: "var(--text-tertiary)" }}
                        />
                      )}
                    </div>

                    {/* Progress bar (always show if target > 0) */}
                    {goal.target_amount_cents > 0 && !isExpanded && (
                      <div className="mt-2 flex items-center gap-2">
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{
                            backgroundColor: "var(--surface-sunken)",
                          }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${progressPercent}%`,
                              backgroundColor: style.border,
                            }}
                          />
                        </div>
                        <span
                          className="text-[10px] tabular-nums"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {Math.round(progressPercent)}%
                        </span>
                      </div>
                    )}

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        {goal.description && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {goal.description}
                          </p>
                        )}

                        {/* Full progress bar in expanded */}
                        {goal.target_amount_cents > 0 && (
                          <div className="flex items-center gap-2">
                            <div
                              className="flex-1 h-2 rounded-full overflow-hidden"
                              style={{
                                backgroundColor: "var(--surface-sunken)",
                              }}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${progressPercent}%`,
                                  backgroundColor: style.border,
                                }}
                              />
                            </div>
                            <span
                              className="text-xs tabular-nums font-medium"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {Math.round(progressPercent)}%
                            </span>
                          </div>
                        )}

                        {goal.estimated_monthly_impact_cents !== 0 && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Monthly impact:{" "}
                            {goal.estimated_monthly_impact_cents > 0 ? "+" : ""}
                            {formatCurrency(goal.estimated_monthly_impact_cents)}/mo
                          </p>
                        )}

                        {/* Checklist */}
                        {checklistTotal > 0 && (
                          <div className="space-y-1.5">
                            <p
                              className="text-xs font-semibold"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Preparation ({checklistDone}/{checklistTotal})
                            </p>
                            {goal.preparation_checklist.map(
                              (item, idx) => (
                                <label
                                  key={idx}
                                  className="flex items-center gap-2 text-xs cursor-pointer"
                                  style={{
                                    color: item.done
                                      ? "var(--text-tertiary)"
                                      : "var(--text-secondary)",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={item.done}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleGoalChecklistItem(goal.id, idx);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded cursor-pointer"
                                  />
                                  <span
                                    className={
                                      item.done ? "line-through" : ""
                                    }
                                  >
                                    {item.item}
                                  </span>
                                </label>
                              )
                            )}
                          </div>
                        )}

                        {/* View Goal link */}
                        <Link
                          href={`/goals/${goal.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium pt-1 cursor-pointer"
                          style={{ color: "var(--text-secondary)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Goal
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Interaction warning */}
                {interaction && (
                  <div
                    className="relative mb-3 ml-0 py-2 px-2.5 rounded-lg flex items-start gap-2 text-xs"
                    style={{
                      backgroundColor: "var(--pastel-yellow-light)",
                    }}
                  >
                    <AlertTriangle
                      className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                      style={{ color: "var(--pastel-yellow-dark)" }}
                    />
                    <span style={{ color: "var(--text-secondary)" }}>
                      {interaction.warningMessage}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
