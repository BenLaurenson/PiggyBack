"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Users } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

interface AISplitAnalysisCardProps {
  /** Display name for the requesting user. */
  userName: string;
  /** Display name for the partner — falls back to "Your partner" when omitted. */
  partnerName?: string | null;
  totalSharedSpend: number;
  userPaid: number;
  partnerPaid: number;
  userPaidPercentage: number;
  userIncomePercentage: number;
  suggestedRebalanceCents: number;
  rebalanceTarget: "user" | "partner" | "balanced";
  hasEnoughData: boolean;
}

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

/**
 * "AI Split Analysis" dashboard card — populates the landing-page mockup with
 * real data for users who have a 2Up account configured.
 *
 * Shows: shared spend, user vs partner contribution, income share comparison,
 * and (if there's a meaningful gap) a suggested rebalance amount.
 *
 * Renders a graceful empty state when there's not enough data — points users
 * at the partner setup page so they can configure split rules.
 */
export function AISplitAnalysisCard({
  userName,
  partnerName,
  totalSharedSpend,
  userPaid,
  partnerPaid,
  userPaidPercentage,
  userIncomePercentage,
  suggestedRebalanceCents,
  rebalanceTarget,
  hasEnoughData,
}: AISplitAnalysisCardProps) {
  const partnerLabel = partnerName ?? "Your partner";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
    >
      <Card
        className="border-0 shadow-sm overflow-hidden"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users
              className="w-4 h-4"
              style={{ color: "var(--pastel-purple-dark)" }}
              aria-hidden="true"
            />
            <CardTitle
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              2Up Split Analysis
            </CardTitle>
          </div>
          <Link
            href="/budget?view=shared"
            className="text-xs font-medium"
            style={{ color: "var(--pastel-purple-dark)" }}
          >
            View shared budget →
          </Link>
        </CardHeader>
        <CardContent>
          {!hasEnoughData ? (
            <div className="space-y-2 py-3">
              <p
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Connect a 2Up (joint) account and configure category splits to
                see how shared spend is balanced this month.
              </p>
              <Link
                href="/settings/partner"
                className="text-xs font-medium"
                style={{ color: "var(--pastel-purple-dark)" }}
              >
                Set up your partner →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Headline: user vs partner spend + income context */}
              <div className="flex items-start gap-2">
                <Sparkles
                  className="w-3.5 h-3.5 mt-1 flex-shrink-0"
                  style={{ color: "var(--pastel-purple-dark)" }}
                  aria-hidden="true"
                />
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span className="font-semibold">{userName}</span> is paying{" "}
                  <span className="font-semibold">{userPaidPercentage}%</span>{" "}
                  of shared expenses ({formatCurrency(userPaid)}) vs{" "}
                  <span className="font-semibold">{userIncomePercentage}%</span>{" "}
                  income share.
                  {rebalanceTarget === "balanced" && (
                    <> Spend matches income — nicely balanced.</>
                  )}
                  {rebalanceTarget === "partner" && suggestedRebalanceCents > 0 && (
                    <>
                      {" "}
                      <span className="font-medium">{partnerLabel}</span> could
                      take on {formatCurrency(suggestedRebalanceCents)}/mo more
                      to balance.
                    </>
                  )}
                  {rebalanceTarget === "user" && suggestedRebalanceCents > 0 && (
                    <>
                      {" "}
                      You could take on{" "}
                      {formatCurrency(suggestedRebalanceCents)}/mo more to match
                      income share.
                    </>
                  )}
                </p>
              </div>

              {/* Stacked bar of spend split */}
              <div>
                <div
                  className="h-3 rounded-full overflow-hidden flex"
                  style={{ backgroundColor: "var(--surface)" }}
                  aria-label={`${userName} ${userPaidPercentage}%, ${partnerLabel} ${100 - userPaidPercentage}%`}
                >
                  <div
                    style={{
                      width: `${userPaidPercentage}%`,
                      backgroundColor: "var(--pastel-purple)",
                    }}
                  />
                  <div
                    style={{
                      width: `${100 - userPaidPercentage}%`,
                      backgroundColor: "var(--pastel-blue)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px]"
                  style={{ color: "var(--text-tertiary)" }}>
                  <span>
                    {userName}: {formatCurrency(userPaid)}
                  </span>
                  <span>Total: {formatCurrency(totalSharedSpend)}</span>
                  <span>
                    {partnerLabel}: {formatCurrency(partnerPaid)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
