/**
 * Reconciliation cron driver.
 *
 * Runs daily and re-syncs any user whose accounts are in STALE_PARTIAL
 * (or are stale-CURRENT, i.e. haven't synced in 24h) and aren't past the
 * SYNC_ERROR_CAP. The actual sync work is delegated to runSyncForUser
 * with trigger='reconciliation_cron' so the audit trail is correct.
 *
 * One sync run per user (not per account) — runSyncForUser walks all of
 * a user's accounts internally. This avoids spamming Up Bank with
 * parallel requests for the same token.
 */

import { getStaleAccounts } from "@/lib/sync/state";
import { runSyncForUser } from "@/lib/sync/runner";

export interface ReconciliationResult {
  staleAccounts: number;
  usersTriggered: number;
  successes: number;
  failures: number;
  errors: Array<{ userId: string; error: string }>;
}

export async function reconcileStaleAccounts(
  limit = 100
): Promise<ReconciliationResult> {
  const stale = await getStaleAccounts(limit);
  // Group by user — one sync per user covers all of their accounts.
  const userIds = [...new Set(stale.map((a) => a.user_id))];

  const result: ReconciliationResult = {
    staleAccounts: stale.length,
    usersTriggered: userIds.length,
    successes: 0,
    failures: 0,
    errors: [],
  };

  for (const userId of userIds) {
    try {
      const r = await runSyncForUser({
        userId,
        trigger: "reconciliation_cron",
      });
      if (r.ok) {
        result.successes++;
      } else {
        result.failures++;
        result.errors.push({
          userId,
          error: r.errors[0] ?? "unknown",
        });
      }
    } catch (err) {
      console.error("[reconciliation] sync failed for user", userId, err);
      result.failures++;
      result.errors.push({
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
