"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FireSetupPrompt } from "@/components/plan/fire-setup-prompt";
import { FireGameplanPage } from "@/components/plan/fire-gameplan";
import { FinancialHealthSnapshot } from "@/components/plan/financial-health-snapshot";
import { PriorityRecommendations } from "@/components/plan/priority-recommendations";
import { GoalsTimeline } from "@/components/plan/goals-timeline";
import type { GoalTimelineData } from "@/components/plan/goals-timeline";
import { CheckupWizard } from "@/components/plan/annual-checkup/checkup-wizard";
import { motion } from "framer-motion";
import { Flame, LayoutDashboard } from "lucide-react";
import {
  type FireResult,
  type FireRecommendation,
  type FireProfile,
  type SpendingData,
  type InvestmentData,
} from "@/lib/fire-calculations";
import type { FireGameplan } from "@/lib/fire-gameplan";
import type {
  HealthMetric,
  PriorityRecommendation,
  GoalInteraction,
  MetricStatus,
} from "@/lib/plan-health-calculations";

// ============================================================================
// Status color config (matches invest/goals quick stat pattern)
// ============================================================================

const statusDotColor: Record<MetricStatus, string> = {
  good: "var(--pastel-mint-dark)",
  warning: "var(--pastel-yellow-dark)",
  concern: "var(--pastel-coral-dark)",
};

// ============================================================================
// Types
// ============================================================================

export interface AnnualCheckupData {
  id: string;
  financial_year: number;
  current_step: number;
  step_data: Record<string, unknown>;
  action_items: { text: string; priority: string; done: boolean }[];
  started_at: string;
  completed_at: string | null;
}

export interface CheckupReviewData {
  hasDebt: boolean;
  hasInvestments: boolean;
  hasSuperProfile: boolean;
  // Step 1: Spending
  monthlyEssentialsCents: number;
  monthlyDiscretionaryCents: number;
  monthlyTotalSpendCents: number;
  topCategories: { name: string; amountCents: number }[];
  // Step 2: Savings
  liquidBalanceCents: number;
  emergencyFundMonths: number;
  savingsRatePercent: number;
  activeGoalsCount: number;
  goalsTotalSavedCents: number;
  goalsTotalTargetCents: number;
  // Step 3: Investments
  totalInvestmentCents: number;
  investmentAllocation: { assetType: string; valueCents: number; percent: number }[];
  rebalanceDeltas: { assetType: string; currentPercent: number; targetPercent: number; deltaPercent: number }[];
  hasTargetAllocations: boolean;
  // Step 4: Debt
  homeLoanBalanceCents: number;
  homeLoanAccountCount: number;
  // Step 5: Super
  superBalanceCents: number;
  sgRate: number;
  annualIncomeCents: number;
  superCapRoomCents: number;
  currentAge: number | null;
  targetRetirementAge: number | null;
  // Step 7: Summary
  priorityRecommendationsSummary: { title: string; priority: string }[];
}

export interface PlanClientProps {
  // Existing FIRE props (unchanged)
  fireOnboarded: boolean;
  fireResult: FireResult | null;
  recommendations: FireRecommendation[];
  fireProfile: FireProfile | null;
  spending: SpendingData | null;
  investments: InvestmentData | null;
  currentAge: number | null;
  savingsRate: number;
  fireGameplan: FireGameplan | null;
  // New Plan tab props
  healthMetrics: HealthMetric[];
  priorityRecommendations: PriorityRecommendation[];
  timelineGoals: GoalTimelineData[];
  goalInteractions: GoalInteraction[];
  currentCheckup: AnnualCheckupData | null;
  checkupReviewData: CheckupReviewData;
  partnershipId: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function PlanClient({
  fireOnboarded,
  fireResult,
  recommendations,
  fireProfile,
  spending,
  investments,
  currentAge,
  savingsRate,
  fireGameplan,
  healthMetrics,
  priorityRecommendations,
  timelineGoals,
  goalInteractions,
  currentCheckup,
  checkupReviewData,
  partnershipId,
}: PlanClientProps) {
  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="p-4 md:p-6 lg:p-8">
        <PageHeader />

        <Tabs defaultValue="plan">
          <TabsList variant="underline" className="mb-4 md:mb-6">
            <TabsTrigger value="plan" className="cursor-pointer">
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
              Plan
            </TabsTrigger>
            <TabsTrigger value="fire" className="cursor-pointer">
              <Flame className="w-4 h-4" aria-hidden="true" />
              FIRE
            </TabsTrigger>
          </TabsList>

          {/* ============================================================ */}
          {/* PLAN TAB                                                      */}
          {/* ============================================================ */}
          <TabsContent value="plan">
            {/* ─── Quick Stats Strip ─── */}
            {healthMetrics.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.01 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:mb-6"
              >
                {healthMetrics.slice(0, 4).map((metric) => (
                  <div
                    key={metric.id}
                    className="border-0 shadow-sm rounded-2xl p-4"
                    style={{ backgroundColor: "var(--surface-elevated)" }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <svg
                        className="w-1.5 h-1.5 flex-shrink-0"
                        viewBox="0 0 6 6"
                        aria-hidden="true"
                      >
                        <circle
                          cx="3"
                          cy="3"
                          r="3"
                          fill={statusDotColor[metric.status]}
                        />
                      </svg>
                      <p
                        className="text-[10px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {metric.label}
                      </p>
                    </div>
                    <p
                      className="font-[family-name:var(--font-nunito)] text-lg font-bold tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {metric.value}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}

            {/* ─── Main 3-column layout (matches invest/goals pattern) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              {/* ═══ LEFT COLUMN ═══ */}
              <div className="lg:col-span-2 space-y-4 md:space-y-6">
                {priorityRecommendations.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 }}
                  >
                    <PriorityRecommendations
                      recommendations={priorityRecommendations}
                    />
                  </motion.div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 }}
                >
                  <GoalsTimeline
                    goals={timelineGoals}
                    interactions={goalInteractions}
                  />
                </motion.div>
              </div>

              {/* ═══ RIGHT COLUMN ═══ */}
              <div className="space-y-4 md:space-y-6">
                {healthMetrics.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 }}
                  >
                    <FinancialHealthSnapshot metrics={healthMetrics} />
                  </motion.div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 }}
                >
                  <CheckupWizard
                    checkup={currentCheckup}
                    reviewData={checkupReviewData}
                    partnershipId={partnershipId}
                  />
                </motion.div>
              </div>
            </div>
          </TabsContent>

          {/* ============================================================ */}
          {/* FIRE TAB                                                      */}
          {/* ============================================================ */}
          <TabsContent value="fire">
            {fireOnboarded &&
            fireResult &&
            fireProfile &&
            spending &&
            investments &&
            currentAge !== null &&
            fireGameplan ? (
              <FireGameplanPage
                fireResult={fireResult}
                fireProfile={fireProfile}
                spending={spending}
                investments={investments}
                currentAge={currentAge}
                savingsRate={savingsRate}
                gameplan={fireGameplan}
              />
            ) : (
              <div className="max-w-2xl mx-auto mt-8">
                <FireSetupPrompt />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function PageHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4"
    >
      <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
        Plan
      </h1>
      <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
        Your complete financial picture
      </p>
    </motion.div>
  );
}

