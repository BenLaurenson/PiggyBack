# Sync State Machine — Design Spec

> **Sub-spec 4 of 5.** Builds on Data Architecture (#1).
> Status: drafted 2026-05-01.
> Implementation plan: `2026-05-01-04-sync-state-machine-plan.md`.

## What this spec answers

We've patched the sync route iteratively tonight: per-account try/catch, per-window try/catch, three-layer retry, service-role for RLS-broken writes, partial-success surfacing. The patches solve specific bugs but the route is still a 700-line ad-hoc procedure. This spec turns it into a proper engineered system:

- A durable per-account sync state machine (no more "did the FE get the `phase: done` event?" coupling)
- A reconciliation cron that auto-heals stale syncs without user intervention
- Cursor management that supports incremental + backfill modes
- Observable failure modes (which window failed, what was Up's response, can it be retried)
- A formal contract with the rest of the system: when `accounts.last_synced_at IS NOT NULL` AND no recent error, the data for that account is considered current

## Two write paths to keep separate

1. **The webhook** — Up Bank pushes individual transaction events. Real-time. Single transaction at a time. Already idempotent via `(account_id, up_transaction_id)` unique key.
2. **The bulk sync** — what runs on first connect and on user-triggered "Sync now". Fetches a date-range window of transactions per account. The thing this spec is about.

Both write into the same tables. The bulk sync ensures completeness; the webhook ensures freshness.

## Per-account state machine

```
                                         ┌───────────┐
                                         │  IDLE     │  no sync ever attempted
                                         └─────┬─────┘
                                               │ first-connect or "sync now"
                                               ▼
                                         ┌───────────┐
                                         │ SYNCING   │  active fetch in flight
                                         └──┬────┬───┘
                            success ────────┘    └──── failure (or partial)
                                  ▼                            ▼
                          ┌──────────┐              ┌─────────────────┐
                          │  CURRENT │              │  STALE_PARTIAL  │
                          └─────┬────┘              └────────┬────────┘
                                │                            │
                                │ webhook keeps              │ reconciliation
                                │ data fresh                 │ cron retries
                                │ (but doesn't change state) │
                                ▼                            │
                          ┌────────────┐                     │
                          │  CURRENT   │ ◄───────────────────┘
                          └────────────┘
```

Backwards transitions:
- `CURRENT → STALE_PARTIAL`: the webhook detects an error condition (e.g., Up returns 401, meaning PAT was revoked). The whole account goes back to needing a full sync.
- `CURRENT → IDLE`: account is deleted from Up's side. We mark `is_active=false` and `synced_at_state='IDLE'` so health checks don't flag it.
- `* → SYNC_FAILED_PERMANENT`: after N reconciliation cron retries (e.g., 5 attempts over 5 days) all return 5xx for the same window. We give up auto-retrying and surface "Up Bank's data for this account appears unavailable; contact support@up.com.au with reference {account_id}". User can manually retry.

## Schema additions

```sql
ALTER TABLE accounts
  ADD COLUMN sync_state text NOT NULL DEFAULT 'IDLE'
    CHECK (sync_state IN ('IDLE','SYNCING','CURRENT','STALE_PARTIAL','SYNC_FAILED_PERMANENT')),
  ADD COLUMN sync_started_at timestamptz,
  -- last_synced_at already exists; keep as-is. Renames to "last_full_sync_at" later.
  ADD COLUMN sync_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN sync_last_error text;

CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL,
    -- 'manual' | 'webhook_failover' | 'reconciliation_cron' | 'first_connect'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  total_txns_inserted integer,
  total_txns_updated integer,
  accounts_succeeded integer,
  accounts_partial integer,
  accounts_failed integer,
  -- summary of errors:
  errors jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX sync_runs_user_started_idx ON sync_runs(user_id, started_at DESC);

CREATE TABLE sync_account_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id uuid NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  since timestamptz NOT NULL,
  until timestamptz NOT NULL,
  attempt_number integer NOT NULL,
  outcome text NOT NULL,  -- 'success' | 'skipped_window_5xx' | 'persistent_failure' | 'unauthorized'
  error_message text,
  http_status integer,
  windows_skipped integer DEFAULT 0,
  windows_total integer,
  txns_inserted integer DEFAULT 0,
  txns_updated integer DEFAULT 0,
  duration_ms integer
);

CREATE INDEX sync_account_attempts_account_started_idx
  ON sync_account_attempts(account_id, sync_run_id);
```

## Cursor: per-account, per-window

Currently sync uses `up_api_configs.last_synced_at` as the cursor for ALL accounts. This is wrong for partial-failure cases — a successful account would want incremental, but a failed account needs full re-fetch.

New rule: the cursor for each account is `accounts.last_synced_at` (already added). When this is NULL, sync from `twelveMonthsAgo`. When set, sync from that timestamp.

The bulk sync route walks accounts and computes per-account `since`:
```
since = account.last_synced_at ?? twelveMonthsAgo
```

This means failed accounts naturally re-fetch their full history on the next attempt; successful accounts only fetch the delta.

## Window discipline

The per-30-day-window pattern stays. New rule: each window's success/failure is recorded in `sync_account_attempts.windows_skipped`. After a sync run, we know:
- Which 30-day windows succeeded (data flowed in)
- Which 30-day windows 5xx'd
- Whether retrying those specific windows is worthwhile

For permanently-failed windows (5+ retries over 5+ days, all 5xx), we surface them to the user with specific date ranges and direct them to contact Up support. We don't keep retrying forever.

## Reconciliation cron (NEW)

Daily at 03:00 UTC:
```sql
SELECT a.id, a.user_id, a.display_name, a.sync_state, a.last_synced_at, a.sync_error_count
FROM accounts a
JOIN up_api_configs c ON c.user_id = a.user_id
WHERE a.is_active = true
  AND c.is_active = true
  AND (
    a.sync_state = 'STALE_PARTIAL'
    OR (a.sync_state = 'CURRENT' AND a.last_synced_at < now() - interval '24 hours')
  )
  AND a.sync_error_count < 10  -- stop retrying after persistent failures
ORDER BY a.last_synced_at NULLS FIRST
LIMIT 100;
```

For each row: invoke the bulk-sync route as the user (server-to-server with elevated auth). Record outcome. Increment `sync_error_count` on failure; reset to 0 on success.

This makes sync **eventually consistent**. A user who closes the tab mid-sync, who has a flaky network, whose Up Bank had a transient 500 — they all get auto-healed by the next cron pass. No user action required.

## Webhook failover

When the webhook arrives but the transaction's account is in `STALE_PARTIAL` state, we still process the webhook (idempotent insert). The webhook doesn't change `sync_state` — that's the bulk sync's responsibility. So real-time updates work even when bulk sync is broken.

If the webhook returns Up `401` (PAT revoked), we transition all of that user's accounts to `STALE_PARTIAL` and notify the user. Can't re-fetch without a fresh PAT.

## Surface to users

Three places where sync state is visible:

1. **`/settings/up-connection`** — list of accounts with state badge:
   - 🟢 CURRENT — fully synced, recent
   - 🟡 STALE_PARTIAL — some data missing, auto-retry queued
   - 🔴 SYNC_FAILED_PERMANENT — give-up state, contact Up support
   - ⚪ IDLE — never synced (shouldn't appear post-onboarding)
   - 🔵 SYNCING — currently fetching

2. **`/admin/sync-stragglers`** (NEW) — admin page lists all users with any account in a non-CURRENT state. Admin can manually re-trigger a sync per account.

3. **Email digest** — if a user's account stays in `STALE_PARTIAL` for >7 days and reconciliation hasn't recovered, send a weekly digest "Heads up — these dates of transactions haven't synced yet" with action steps.

## Idempotency contract

Every operation in the sync flow must be idempotent. Validated by tests:
- Re-running the same window: no new rows, no updates that change semantics
- Re-running with a NEW transaction in the window: only the new row inserted
- Re-running after manual edits: user edits in `transaction_*_overrides` are preserved (sync upsert hits the base `transactions` row, not overrides)

## Token refresh hook

If Up's API returns 401, we don't just throw `UpUnauthorizedError`. We:
1. Mark `up_api_configs.is_active = false`
2. Mark all of the user's accounts as `STALE_PARTIAL`
3. Send an email to the user: "Your Up Bank connection needs renewal — please reconnect at {tenant}/settings/up-connection"
4. Don't auto-retry the cron (we'd just hit 401 again)

When user reconnects with new PAT, sync auto-runs and walks all accounts back to CURRENT.

## What this replaces

- The current `MAX_ACCOUNT_ATTEMPTS = 3` retry loop → reconciliation cron handles it
- The FE auto-retry → kept, but limited to errors that look transient (already done)
- The user-level `last_synced_at` → kept as a UI-only field; per-account is the truth
- The `phase: done` stream event → kept for live UI, but BE state advancement is independent
- Manual cleanup queries to find stuck users → `/admin/sync-stragglers` endpoint

## Acceptance criteria

- [ ] After bulk sync, every account has a row in `sync_account_attempts` with explicit outcome
- [ ] Reconciliation cron auto-fixes a user whose sync was killed mid-run, no UI interaction needed
- [ ] User can see per-account sync state on `/settings/up-connection`
- [ ] Up 5xx for 30 days on a specific window → SYNC_FAILED_PERMANENT, with user-facing message
- [ ] PAT revocation → all accounts STALE_PARTIAL + email notification
- [ ] Webhook continues to work when bulk sync is broken
- [ ] All transitions emit audit rows in `sync_account_attempts`
- [ ] Existing dev DB migrations run cleanly (additive only)

## Test strategy

- Unit: state transition validation, cursor computation
- Integration: full sync run with mocked Up API; assert sync_runs + sync_account_attempts rows are correct
- Property test: idempotency — repeated runs converge to same state
- Concurrency: two simultaneous sync runs for same user (rate-limited to 1 in-flight, second returns 429 with current state)
- Recovery: simulate "user closes tab mid-sync" → reconciliation cron picks it up next cycle
- 401 path: simulate token revocation, verify state cascade + email send
