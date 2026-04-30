/**
 * Match a single transaction (just upserted by the Up Bank webhook) against
 * any active recurring_investments rule whose merchant_pattern is a
 * case-insensitive substring of the transaction's description, and record
 * an investment_contributions row keyed by (rule_id, source_transaction_id).
 *
 * Idempotency:
 *   - One contribution per (rule, source transaction) — backed by a unique
 *     index (uniq_investment_contributions_rule_txn). We do INSERT … ON
 *     CONFLICT DO NOTHING so re-fired webhooks are safe.
 *   - We only act on negative-amount transactions (i.e. money leaving the
 *     account); brokerage dividends often share the same merchant string
 *     and shouldn't count as a contribution.
 *
 * Scope:
 *   - The webhook already determined the partnership for this transaction
 *     via the account.user_id → partnership_members lookup. We pass that
 *     down explicitly to avoid re-fetching.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MatchRecurringInvestmentInput {
  /** Service-role Supabase client. */
  supabase: SupabaseClient;
  /** UUID of the transactions row that was just upserted. */
  transactionId: string;
  /** transaction.description (or rawText) — used for substring match. */
  description: string;
  /** Negative-cents amount (debit). Used to populate amount_cents. */
  amountCents: number;
  /** Partnership id this transaction's account belongs to. */
  partnershipId: string;
  /**
   * Time the transaction settled / was created (ISO string). Used as the
   * contributed_at value so the contribution sits on the txn's day, not
   * the day the webhook fired.
   */
  contributedAt: string;
}

export interface MatchedRule {
  ruleId: string;
  assetId: string;
  amountCents: number;
}

/**
 * Returns the rule(s) that matched. The webhook caller logs this for
 * observability.
 */
export async function matchTransactionToRecurringInvestments(
  input: MatchRecurringInvestmentInput
): Promise<MatchedRule[]> {
  const { supabase, transactionId, description, amountCents, partnershipId, contributedAt } = input;

  if (!description) return [];
  // Only debits count — positive amounts are inflows (e.g. dividend).
  if (amountCents >= 0) return [];

  // Pull active rules for this partnership. With the partial index
  // idx_recurring_investments_active_lookup this is O(num_active_rules)
  // (typically <10), and we filter the substring match in JS so we don't
  // need to fight Postgres's collation rules.
  const { data: rules, error: ruleErr } = await supabase
    .from("recurring_investments")
    .select("id, asset_id, amount_cents, merchant_pattern")
    .eq("partnership_id", partnershipId)
    .eq("is_active", true);

  if (ruleErr || !rules || rules.length === 0) return [];

  const desc = description.toLowerCase();
  const matched = rules.filter((r: { merchant_pattern: string }) => {
    const pat = (r.merchant_pattern || "").trim().toLowerCase();
    return pat.length > 0 && desc.includes(pat);
  });

  if (matched.length === 0) return [];

  const out: MatchedRule[] = [];
  for (const rule of matched) {
    // Use the actual debit amount (absolute) — not rule.amount_cents — so
    // an irregular contribution (e.g. one-off top-up via the same merchant)
    // is recorded faithfully. The rule's amount_cents is only the
    // user-stated EXPECTED amount.
    const recordedAmountCents = Math.abs(amountCents);

    const { error: insertErr } = await supabase
      .from("investment_contributions")
      .insert({
        investment_id: rule.asset_id,
        partnership_id: partnershipId,
        amount_cents: recordedAmountCents,
        contributed_at: contributedAt,
        rule_id: rule.id,
        source_transaction_id: transactionId,
        notes: null,
      });

    if (insertErr) {
      // 23505 = unique violation, expected when a webhook re-fires for the
      // same (rule, txn) pair. Anything else is worth surfacing.
      const code = (insertErr as { code?: string }).code;
      if (code !== "23505") {
        console.error("[recurring-invest] insert failed:", insertErr.message);
      }
      continue;
    }

    out.push({
      ruleId: rule.id,
      assetId: rule.asset_id,
      amountCents: recordedAmountCents,
    });
  }

  return out;
}
