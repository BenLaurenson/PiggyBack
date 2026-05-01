/**
 * Sync state machine helpers.
 *
 * Drives transitions on `accounts.sync_state` and writes audit rows to
 * `sync_runs` + `sync_account_attempts`. All helpers use the service-role
 * client because they're invoked from server contexts (sync route, cron,
 * webhook failover) and need to bypass RLS to write to other users'
 * accounts where appropriate (e.g., reconciliation cron).
 *
 * The transitions encoded here are:
 *
 *   IDLE / CURRENT / STALE_PARTIAL  --markAccountSyncing-->  SYNCING
 *   SYNCING                         --markAccountCurrent--> CURRENT
 *   SYNCING                         --markAccountStalePartial--> STALE_PARTIAL
 *   *                               --markAccountFailed--> SYNC_FAILED_PERMANENT
 *
 * Idempotency is preserved by all callers: re-running a sync over the
 * same window is safe due to ON CONFLICT DO UPDATE upserts elsewhere.
 */

import { createServiceRoleClient } from "@/utils/supabase/service-role";

export type SyncState =
  | "IDLE"
  | "SYNCING"
  | "CURRENT"
  | "STALE_PARTIAL"
  | "SYNC_FAILED_PERMANENT";

export type SyncTrigger =
  | "manual"
  | "first_connect"
  | "reconciliation_cron"
  | "webhook_failover";

export type AttemptOutcome =
  | "success"
  | "partial"
  | "skipped_window_5xx"
  | "persistent_failure"
  | "unauthorized";

/** Stop auto-retrying via reconciliation after this many consecutive errors. */
export const SYNC_ERROR_CAP = 10;

/** Mark a single account as actively syncing. Idempotent. */
export async function markAccountSyncing(accountId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      sync_state: "SYNCING",
      sync_started_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (error) {
    console.error("[sync state] markAccountSyncing failed", accountId, error);
  }
}

/** Mark a single account as fully synced and reset error tracking. */
export async function markAccountCurrent(accountId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      sync_state: "CURRENT",
      last_synced_at: new Date().toISOString(),
      sync_error_count: 0,
      sync_last_error: null,
    })
    .eq("id", accountId);

  if (error) {
    console.error("[sync state] markAccountCurrent failed", accountId, error);
  }
}

/**
 * Mark an account as partially synced. Reads current sync_error_count and
 * increments it; the reconciliation cron uses this as the give-up signal
 * once it exceeds SYNC_ERROR_CAP.
 */
export async function markAccountStalePartial(
  accountId: string,
  reason: string
): Promise<void> {
  const supabase = createServiceRoleClient();

  // Read current count to increment. Defaults to 0 if unreadable.
  const { data: existing } = await supabase
    .from("accounts")
    .select("sync_error_count")
    .eq("id", accountId)
    .single();

  const nextCount = (existing?.sync_error_count ?? 0) + 1;

  const { error } = await supabase
    .from("accounts")
    .update({
      sync_state: "STALE_PARTIAL",
      sync_error_count: nextCount,
      sync_last_error: reason,
    })
    .eq("id", accountId);

  if (error) {
    console.error(
      "[sync state] markAccountStalePartial failed",
      accountId,
      error
    );
  }
}

/** Permanently fail an account — reconciliation should leave it alone. */
export async function markAccountFailed(
  accountId: string,
  reason: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      sync_state: "SYNC_FAILED_PERMANENT",
      sync_last_error: reason,
    })
    .eq("id", accountId);

  if (error) {
    console.error("[sync state] markAccountFailed failed", accountId, error);
  }
}

/**
 * Find accounts that need reconciliation:
 *   - STALE_PARTIAL (sync had errors and didn't recover)
 *   - or CURRENT but last_synced_at is older than 24h (cold backstop in case
 *     the webhook is silently broken)
 *
 * Excludes accounts past the error cap (SYNC_ERROR_CAP) to avoid the cron
 * hammering an unrecoverable upstream forever.
 */
export interface StaleAccountRow {
  id: string;
  user_id: string;
  display_name?: string;
  sync_state: SyncState;
  last_synced_at: string | null;
  sync_error_count: number;
}

export async function getStaleAccounts(
  limit = 100
): Promise<StaleAccountRow[]> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("accounts")
    .select("id, user_id, display_name, sync_state, last_synced_at, sync_error_count")
    .eq("is_active", true)
    .or(
      `sync_state.eq.STALE_PARTIAL,and(sync_state.eq.CURRENT,last_synced_at.lt.${cutoff})`
    )
    .lt("sync_error_count", SYNC_ERROR_CAP)
    .limit(limit);

  if (error) {
    console.error("[sync state] getStaleAccounts failed", error);
    return [];
  }
  return (data ?? []) as StaleAccountRow[];
}

/* ------------------------------------------------------------------ *
 * Run + attempt logging
 * ------------------------------------------------------------------ */

/** Start a new sync_runs row. Returns the new row id. */
export async function startSyncRun(
  userId: string,
  trigger: SyncTrigger
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      user_id: userId,
      trigger,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[sync state] startSyncRun failed", error);
    return null;
  }
  return data.id as string;
}

export interface AccountAttemptArgs {
  syncRunId: string;
  accountId: string;
  since: string;
  until: string;
  attemptNumber: number;
  outcome: AttemptOutcome;
  errorMessage?: string;
  httpStatus?: number;
  windowsSkipped?: number;
  windowsTotal?: number;
  txnsInserted?: number;
  txnsUpdated?: number;
  durationMs?: number;
}

/** Insert one sync_account_attempts row describing the outcome for an account. */
export async function recordAccountAttempt(
  args: AccountAttemptArgs
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("sync_account_attempts").insert({
    sync_run_id: args.syncRunId,
    account_id: args.accountId,
    since: args.since,
    until: args.until,
    attempt_number: args.attemptNumber,
    outcome: args.outcome,
    error_message: args.errorMessage ?? null,
    http_status: args.httpStatus ?? null,
    windows_skipped: args.windowsSkipped ?? 0,
    windows_total: args.windowsTotal ?? 0,
    txns_inserted: args.txnsInserted ?? 0,
    txns_updated: args.txnsUpdated ?? 0,
    duration_ms: args.durationMs ?? null,
  });

  if (error) {
    console.error("[sync state] recordAccountAttempt failed", error);
  }
}

export interface SyncRunSummary {
  totalTxnsInserted: number;
  totalTxnsUpdated?: number;
  accountsSucceeded: number;
  accountsPartial: number;
  accountsFailed: number;
  errors: string[];
}

/** Mark a sync_runs row complete with totals. */
export async function finishSyncRun(
  runId: string,
  summary: SyncRunSummary
): Promise<void> {
  const supabase = createServiceRoleClient();

  // Compute duration_ms by reading started_at first; fallback to 0 if missing.
  let durationMs = 0;
  const { data: existing } = await supabase
    .from("sync_runs")
    .select("started_at")
    .eq("id", runId)
    .single();
  if (existing?.started_at) {
    durationMs = Date.now() - new Date(existing.started_at).getTime();
  }

  const { error } = await supabase
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      total_txns_inserted: summary.totalTxnsInserted,
      total_txns_updated: summary.totalTxnsUpdated ?? 0,
      accounts_succeeded: summary.accountsSucceeded,
      accounts_partial: summary.accountsPartial,
      accounts_failed: summary.accountsFailed,
      errors: summary.errors,
    })
    .eq("id", runId);

  if (error) {
    console.error("[sync state] finishSyncRun failed", error);
  }
}
