import type { SupabaseClient } from '@supabase/supabase-js';
import { computeGstAmountCents, type GstCode } from '@/lib/business-gst';
import {
  matchCategorisationRule,
  type CategorisationRule,
} from '@/lib/business-categorise';
import { convertToAudCents, fetchAudRateForCurrency } from '@/lib/wise-fx';

export type IngestSource = 'wise_api' | 'csv_import';

/**
 * Normalised input shape — adapter at the caller maps Wise/CSV rows to this.
 *
 * For wise_api: `reference_number` is Wise's raw referenceNumber (NOT unique
 * on its own — see business-ingest comment block). This function composes the
 * per-leg idempotency key as `${reference_number}|${direction}` and writes it
 * to `wise_transaction_id`; the raw value stays in `reference_number`.
 *
 * For csv_import: pass `reference_number: null` and supply `import_fingerprint`
 * instead — the upsert conflict target switches accordingly.
 */
export interface IngestEntry {
  /** Wise's raw referenceNumber. Null for CSV rows. */
  reference_number: string | null;
  /** CSV idempotency key (sha1 of normalised composite); null for API rows. */
  import_fingerprint?: string | null;
  occurred_at: Date;
  description: string;
  /** Native currency cents. Negative = debit, positive = credit. */
  amount_cents: number;
  currency_code: string;
  wise_category: string | null;
  /** Wise-supplied AUD-per-unit rate when present (transfer/conversion legs). */
  exchange_rate_from_wise: number | null;
  raw_payload: unknown;
}

export interface ProcessInput {
  userId: string;
  businessAccountId: string;
  source: IngestSource;
  reportingTimezone: string;
  rules: CategorisationRule[];
  entry: IngestEntry;
}

/**
 * Single shared ingestion function for Wise statements and CSV imports.
 * Both the future webhook handler and the manual-sync worker call this.
 *
 * The function performs **no DB reads** — categorisation rules are passed
 * in fully resolved (with `coa_default_gst_code` pre-joined). The only
 * Supabase call is the final upsert. This keeps the hot path testable
 * without deep mock chains.
 *
 * Wise's `referenceNumber` is NOT globally unique: refund pairs share it
 * (DEBIT charge + CREDIT refund on the same balance) and FX legs share it
 * across balances. The per-leg idempotency key is therefore composite —
 * `${reference_number}|${direction}` — written to `wise_transaction_id`,
 * while `reference_number` holds the raw Wise value for audit/display.
 *
 * Caller passes a Supabase client (anon, server, or service-role); this
 * function does not assume which.
 */
export async function processWiseTransaction(
  supabase: SupabaseClient,
  input: ProcessInput,
): Promise<void> {
  const { userId, businessAccountId, source, reportingTimezone, rules, entry } = input;

  // ---- 1. Date derivation (reporting_date in user's timezone) ----
  const reporting_date = formatInTimeZone(entry.occurred_at, reportingTimezone);

  // ---- 2. Direction ----
  const direction: 'credit' | 'debit' = entry.amount_cents >= 0 ? 'credit' : 'debit';

  // ---- 3. FX resolution ----
  let amount_aud_cents: number | null = null;
  let exchange_rate: number | null = null;
  let exchange_rate_source: 'wise' | 'spot_feed' | null = null;
  let exchange_rate_fetched_at: string | null = null;
  let fx_status: 'resolved' | 'missing' = 'resolved';

  if (entry.currency_code === 'AUD') {
    amount_aud_cents = entry.amount_cents;
  } else if (entry.exchange_rate_from_wise !== null) {
    exchange_rate = entry.exchange_rate_from_wise;
    exchange_rate_source = 'wise';
    amount_aud_cents = convertToAudCents(entry.amount_cents, exchange_rate);
  } else {
    try {
      const rate = await fetchAudRateForCurrency(entry.currency_code, entry.occurred_at);
      exchange_rate = rate;
      exchange_rate_source = 'spot_feed';
      exchange_rate_fetched_at = new Date().toISOString();
      amount_aud_cents = convertToAudCents(entry.amount_cents, rate);
    } catch {
      fx_status = 'missing';
    }
  }

  // ---- 4. Categorisation ----
  const matchedRule = matchCategorisationRule(rules, {
    description: entry.description,
    wise_category: entry.wise_category,
  });

  let coa_id: string | null = null;
  let gst_code: GstCode | null = null;

  if (matchedRule) {
    coa_id = matchedRule.coa_id;
    gst_code = matchedRule.gst_code_override ?? matchedRule.coa_default_gst_code;
  }

  // ---- 5. GST amount ----
  // Only compute GST when a rule has assigned a gst_code; uncategorised rows
  // carry null so downstream reports can distinguish "not yet categorised"
  // from "categorised as N-T / out-of-scope".
  const gst_amount_aud_cents =
    gst_code === null ? null : computeGstAmountCents(amount_aud_cents, gst_code);

  // ---- 6. Compose idempotency key for wise_api source ----
  const wise_transaction_id =
    source === 'wise_api' && entry.reference_number !== null
      ? `${entry.reference_number}|${direction}`
      : null;

  // ---- 7. Build row + upsert with the correct conflict target ----
  const row = {
    user_id: userId,
    business_account_id: businessAccountId,
    wise_transaction_id,
    reference_number: entry.reference_number,
    import_fingerprint: entry.import_fingerprint ?? null,
    occurred_at: entry.occurred_at.toISOString(),
    reporting_date,
    description: entry.description,
    amount_cents: entry.amount_cents,
    currency_code: entry.currency_code,
    direction,
    exchange_rate,
    exchange_rate_source,
    exchange_rate_fetched_at,
    amount_aud_cents,
    fx_status,
    wise_category: entry.wise_category,
    coa_id,
    gst_code,
    gst_amount_aud_cents,
    is_reconciled: false,
    source,
    raw_payload: entry.raw_payload,
  };

  const onConflict =
    source === 'csv_import' ? 'user_id,import_fingerprint' : 'user_id,wise_transaction_id';

  const { error } = await supabase
    .from('business_transactions')
    .upsert(row, { onConflict });

  if (error) {
    throw new Error(`processWiseTransaction: upsert failed: ${error.message}`);
  }
}

/**
 * Returns YYYY-MM-DD for `at` interpreted in the given IANA timezone.
 * Uses Intl.DateTimeFormat — no external date library needed.
 */
function formatInTimeZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}
