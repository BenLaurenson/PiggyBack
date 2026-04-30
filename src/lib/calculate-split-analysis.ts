/**
 * AI Split Analysis — pure calculator for the 2Up dashboard insight card.
 *
 * Takes raw inputs (income sources, transactions, split settings) and produces
 * the data needed to render "Ben paid X% of shared expenses vs Y% income share —
 * suggest Sarah cover $Z/mo more to balance."
 *
 * Engine-style: zero database access, all data passed in. Mirrors the contract
 * pattern used by `src/lib/budget-engine.ts` so the same inputs can drive both
 * the dashboard card and the AI agent's `getCoupleSplitAnalysis` tool.
 */
import {
  resolveSplitPercentage,
  type CategoryMapping,
  type IncomeSourceInput,
  type SplitSettingInput,
  type TransactionInput,
} from "@/lib/budget-engine";

export interface SplitAnalysisInput {
  /** Partner-aware transactions for the analysis window — ideally JOINT-account only. */
  transactions: TransactionInput[];
  /** Up category_id → display parent/child names. */
  categoryMappings: CategoryMapping[];
  /** Couple split settings (couple_split_settings rows) — drives per-row split %s. */
  splitSettings: SplitSettingInput[];
  /** All income sources for the partnership (any frequency). */
  incomeSources: IncomeSourceInput[];
  /** auth user id for the requesting user. */
  userId: string;
  /** auth user id of the partnership / budget creator (used as "owner" for splits). */
  ownerUserId: string;
}

export interface SplitAnalysisResult {
  /** Total shared spend in cents for the analysis window. */
  totalSharedSpend: number;
  /** Cents the user actually paid (i.e. sum of (txn × user split %)). */
  userPaid: number;
  /** Cents the partner actually paid. */
  partnerPaid: number;
  /** User's share as a 0..100 integer. */
  userPaidPercentage: number;
  /** User's monthly income as cents. */
  userMonthlyIncome: number;
  /** Partner's monthly income as cents. */
  partnerMonthlyIncome: number;
  /** User's income share (0..100 integer). 50 when no income data. */
  userIncomePercentage: number;
  /** Suggested rebalance: cents/month the *other* partner could absorb so spend % matches income %. */
  suggestedRebalanceCents: number;
  /** Which side should absorb the rebalance — "user" if userPaid% > userIncome%, otherwise "partner". */
  rebalanceTarget: "user" | "partner" | "balanced";
  /** Whether enough data was present to make the call meaningful. */
  hasEnoughData: boolean;
}

const FREQUENCY_TO_MONTHLY: Record<string, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
  "one-off": 0,
};

function toMonthlyCents(amountCents: number, frequency: string): number {
  const multiplier = FREQUENCY_TO_MONTHLY[frequency] ?? 1;
  return Math.round(amountCents * multiplier);
}

/**
 * Compute the 2Up split-analysis card.
 *
 * Algorithm:
 *  1. Sum monthly-equivalent income per partner (skip one-off without received_date).
 *  2. For every shared transaction (negative amount, not income), apply the
 *     appropriate split rule (per-transaction → per-expense → per-category)
 *     to find the user's and partner's share.
 *  3. Compare user's % of shared spend vs user's % of income — surface the gap.
 */
export function calculateSplitAnalysis(
  input: SplitAnalysisInput
): SplitAnalysisResult {
  const { transactions, categoryMappings, splitSettings, incomeSources, userId, ownerUserId } = input;

  // ── 1. Monthly income per partner ─────────────────────────────────────
  let userMonthlyIncome = 0;
  let partnerMonthlyIncome = 0;
  for (const src of incomeSources) {
    const monthly = toMonthlyCents(src.amount_cents, src.frequency);
    // is_manual_partner_income flagged sources always count as the partner.
    if (src.is_manual_partner_income) {
      partnerMonthlyIncome += monthly;
    } else if (src.user_id === userId) {
      userMonthlyIncome += monthly;
    } else {
      partnerMonthlyIncome += monthly;
    }
  }

  const totalIncome = userMonthlyIncome + partnerMonthlyIncome;
  // Default to 50/50 if no income recorded for either side.
  const userIncomePercentage =
    totalIncome > 0 ? Math.round((userMonthlyIncome / totalIncome) * 100) : 50;

  // ── 2. Walk transactions and accumulate user/partner shares ────────────
  const catLookup = new Map<string, { parent: string; child: string }>();
  for (const m of categoryMappings) {
    catLookup.set(m.up_category_id, { parent: m.new_parent_name, child: m.new_child_name });
  }

  const DEFAULT_SHARED_PCT = 50;
  let totalSharedSpend = 0;
  let userPaid = 0;

  for (const txn of transactions) {
    if (txn.is_income || txn.amount_cents >= 0) continue;
    const total = Math.abs(txn.amount_cents);
    totalSharedSpend += total;

    let userPct: number;
    if (txn.split_override_percentage != null) {
      userPct = txn.split_override_percentage;
    } else {
      const mapping = txn.category_id ? catLookup.get(txn.category_id) : null;
      const split =
        (txn.matched_expense_id
          ? splitSettings.find((s) => s.expense_definition_id === txn.matched_expense_id)
          : undefined) ??
        (mapping ? splitSettings.find((s) => s.category_name === mapping.parent) : undefined);
      if (split) {
        userPct = resolveSplitPercentage(split, userId, ownerUserId);
      } else {
        userPct = DEFAULT_SHARED_PCT;
      }
    }

    userPaid += Math.round(total * userPct / 100);
  }

  const partnerPaid = totalSharedSpend - userPaid;
  const userPaidPercentage =
    totalSharedSpend > 0 ? Math.round((userPaid / totalSharedSpend) * 100) : 50;

  // ── 3. Suggested rebalance ───────────────────────────────────────────────
  // If user is paying more than their income share warrants, suggest the
  // partner absorb (userPaid% − userIncome%) of total shared spend each month.
  const gap = userPaidPercentage - userIncomePercentage;
  let rebalanceTarget: SplitAnalysisResult["rebalanceTarget"] = "balanced";
  let suggestedRebalanceCents = 0;
  if (Math.abs(gap) >= 2 && totalSharedSpend > 0) {
    suggestedRebalanceCents = Math.round((Math.abs(gap) / 100) * totalSharedSpend);
    rebalanceTarget = gap > 0 ? "partner" : "user";
  }

  // hasEnoughData: at least one shared transaction AND at least one income source.
  const hasEnoughData = totalSharedSpend > 0 && (userMonthlyIncome > 0 || partnerMonthlyIncome > 0);

  return {
    totalSharedSpend,
    userPaid,
    partnerPaid,
    userPaidPercentage,
    userMonthlyIncome,
    partnerMonthlyIncome,
    userIncomePercentage,
    suggestedRebalanceCents,
    rebalanceTarget,
    hasEnoughData,
  };
}
