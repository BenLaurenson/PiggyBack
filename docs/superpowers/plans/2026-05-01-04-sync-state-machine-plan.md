# Sync State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` tracking.

**Goal:** Replace ad-hoc sync route with a per-account state machine + reconciliation cron + observability tables, while preserving existing idempotent behavior.

**Architecture:** Per-account `sync_state` ENUM + `sync_runs` + `sync_account_attempts` audit tables. Reconciliation cron auto-heals stale syncs.

---

**Spec:** `docs/superpowers/specs/2026-05-01-04-sync-state-machine-design.md`. **Depends on:** plan #1.

---

## File structure

**New:**
- `src/lib/sync/state.ts` — state-machine helpers
- `src/lib/sync/reconciliation.ts` — pulls stale accounts, kicks sync server-to-server
- `src/lib/sync/__tests__/{state,reconciliation}.test.ts`
- `src/app/api/cron/sync-reconciliation/route.ts`
- `src/app/api/admin/sync-stragglers/route.ts` — admin observability
- `src/app/admin/sync-stragglers/page.tsx`
- `supabase/migrations/20260501000006_sync_state_machine.sql`

**Modify:**
- `src/app/api/upbank/sync/route.ts` — write to `sync_runs` + `sync_account_attempts`, set `accounts.sync_state` transitions
- `src/lib/up-api.ts` — already has retry; no changes needed (verify)
- `src/app/(app)/settings/up-connection/page.tsx` — surface per-account state badge

---

## Task 1: Migration — sync_state column + run + attempt tables

**Files:**
- Create: `supabase/migrations/20260501000006_sync_state_machine.sql`

- [ ] **Step 1: SQL**

```sql
-- 20260501000006_sync_state_machine.sql

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS sync_state text NOT NULL DEFAULT 'IDLE'
    CHECK (sync_state IN ('IDLE','SYNCING','CURRENT','STALE_PARTIAL','SYNC_FAILED_PERMANENT')),
  ADD COLUMN IF NOT EXISTS sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_last_error text;

-- Backfill existing accounts: if last_synced_at IS NULL → IDLE,
-- else CURRENT. Runs once at migration time.
UPDATE public.accounts
SET sync_state = CASE
  WHEN last_synced_at IS NULL THEN 'IDLE'
  ELSE 'CURRENT'
END
WHERE sync_state = 'IDLE';

CREATE INDEX IF NOT EXISTS accounts_sync_state_idx ON public.accounts(sync_state)
  WHERE sync_state IN ('STALE_PARTIAL','SYNC_FAILED_PERMANENT');

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL CHECK (trigger IN ('manual','first_connect','reconciliation_cron','webhook_failover')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  total_txns_inserted integer DEFAULT 0,
  total_txns_updated integer DEFAULT 0,
  accounts_succeeded integer DEFAULT 0,
  accounts_partial integer DEFAULT 0,
  accounts_failed integer DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS sync_runs_user_started_idx ON public.sync_runs(user_id, started_at DESC);
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sync_runs" ON public.sync_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.sync_account_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id uuid NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  since timestamptz NOT NULL,
  until timestamptz NOT NULL,
  attempt_number integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','partial','skipped_window_5xx','persistent_failure','unauthorized')),
  error_message text,
  http_status integer,
  windows_skipped integer DEFAULT 0,
  windows_total integer DEFAULT 0,
  txns_inserted integer DEFAULT 0,
  txns_updated integer DEFAULT 0,
  duration_ms integer
);
CREATE INDEX IF NOT EXISTS sync_account_attempts_account_run_idx
  ON public.sync_account_attempts(account_id, sync_run_id);
ALTER TABLE public.sync_account_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sync_account_attempts"
  ON public.sync_account_attempts FOR SELECT TO authenticated
  USING (
    account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  );
GRANT SELECT ON public.sync_account_attempts TO authenticated;
GRANT ALL ON public.sync_account_attempts TO service_role;
```

- [ ] **Step 2: Apply via MCP, verify backfill correctness**

```sql
SELECT sync_state, count(*) FROM accounts GROUP BY sync_state;
```

- [ ] **Step 3: Commit**

---

## Task 2: State helper

**Files:**
- Create: `src/lib/sync/state.ts`
- Test: `src/lib/sync/__tests__/state.test.ts`

- [ ] **Step 1: Failing test**

Tests cover:
- `markAccountSyncing(accountId)` updates `sync_state='SYNCING'` and `sync_started_at=now()`
- `markAccountCurrent(accountId)` sets `sync_state='CURRENT'`, `last_synced_at=now()`, `sync_error_count=0`
- `markAccountStalePartial(accountId, reason)` sets `sync_state='STALE_PARTIAL'`, increments `sync_error_count`, records `sync_last_error`
- `markAccountFailed(accountId, reason)` sets `sync_state='SYNC_FAILED_PERMANENT'`
- `getStaleAccounts(limit)` returns rows where state is STALE_PARTIAL OR (CURRENT AND last_synced_at < 24h ago) AND error_count < 10

- [ ] **Step 2: Implement** with service-role client (these run from sync route + cron, not user-scoped).
- [ ] **Step 3: Tests pass**
- [ ] **Step 4: Commit**

---

## Task 3: Run + attempt logger

**Files:**
- Add to `src/lib/sync/state.ts`:
  - `startSyncRun(userId, trigger): Promise<runId>`
  - `recordAccountAttempt(args): Promise<void>`
  - `finishSyncRun(runId, summary): Promise<void>`

- [ ] **Step 1: Tests** for each function (mocked supabase)
- [ ] **Step 2: Implement**
- [ ] **Step 3: Commit**

---

## Task 4: Wire sync route to use state machine

**Files:**
- Modify: `src/app/api/upbank/sync/route.ts`

The current route is ~700 lines. Don't rewrite — instrument:

- [ ] **Step 1: At sync start (after auth + rate-limit + token decrypt):**
  ```ts
  const syncRunId = await startSyncRun(user.id, "manual" /* or "first_connect" */);
  ```

- [ ] **Step 2: At account-loop start:**
  ```ts
  await markAccountSyncing(savedAccountId);
  ```

- [ ] **Step 3: After each per-account window-loop completes (around line 372 in current code):**
  ```ts
  await recordAccountAttempt({
    syncRunId, accountId: savedAccountId,
    since: sinceDate.toISOString(), until: now.toISOString(),
    attemptNumber: accountAttempt,
    outcome: skippedWindows.length === 0 ? "success" : "partial",
    windowsSkipped: skippedWindows.length,
    windowsTotal: <total computed>,
    txnsInserted: <delta>,
    durationMs: <delta>,
  });
  if (skippedWindows.length === 0) await markAccountCurrent(savedAccountId);
  else await markAccountStalePartial(savedAccountId, `${skippedWindows.length} windows skipped`);
  ```

- [ ] **Step 4: At sync run finish:**
  ```ts
  await finishSyncRun(syncRunId, {
    totalTxnsInserted, accountsSucceeded, accountsPartial, accountsFailed, errors,
  });
  ```

- [ ] **Step 5: Test**: run sync against a fixture user, verify rows appear in sync_runs + sync_account_attempts with correct outcomes.
- [ ] **Step 6: Commit**

---

## Task 5: Reconciliation cron

**Files:**
- Create: `src/lib/sync/reconciliation.ts`
- Create: `src/app/api/cron/sync-reconciliation/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Test**

`reconcileStaleAccounts(limit)` calls `getStaleAccounts(limit)` → for each, server-to-server invokes the sync route as that user (this requires a special invocation path because the sync route uses session-scoped supabase). Approach: extract the sync logic from the route into `runSyncForUser(userId, trigger)` that doesn't depend on a request context. The route becomes a thin wrapper.

- [ ] **Step 2: Refactor sync route**
  - Extract guts into `src/lib/sync/runner.ts: runSyncForUser(userId, trigger)`
  - Route handler validates auth + rate-limit, then calls `runSyncForUser` with stream callbacks.
  - Cron calls `runSyncForUser` directly without stream callbacks (logs go to sync_account_attempts).

This is a substantial refactor — split into its own commit.

- [ ] **Step 3: Implement reconciliation.ts**

```ts
export async function reconcileStaleAccounts(limit = 100): Promise<{ usersTriggered: number }> {
  const stale = await getStaleAccounts(limit);
  const userIds = [...new Set(stale.map(a => a.user_id))];
  let triggered = 0;
  for (const userId of userIds) {
    try {
      await runSyncForUser(userId, "reconciliation_cron");
      triggered++;
    } catch (e) {
      console.error("[reconciliation] sync failed for user", userId, e);
    }
  }
  return { usersTriggered: triggered };
}
```

- [ ] **Step 4: Cron route**

```ts
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await reconcileStaleAccounts(50);
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Add to vercel.json**

```json
{ "path": "/api/cron/sync-reconciliation", "schedule": "0 4 * * *" }
```

(Replace another cron — Hobby cap. Or wait for Pro.)

- [ ] **Step 6: Tests + commit**

---

## Task 6: Admin sync-stragglers page

**Files:**
- Create: `src/app/admin/sync-stragglers/page.tsx`
- Create: `src/app/api/admin/sync-stragglers/route.ts`

- [ ] **Step 1: API route**: GET that returns a list of all stragglers (any user with accounts in non-CURRENT state). Service-role + admin check.
- [ ] **Step 2: Admin page**: lists users + their stragglers with "trigger reconciliation" button per account.
- [ ] **Step 3: Tests, commit**

---

## Task 7: Per-account state badge in /settings/up-connection

**Files:**
- Modify: `src/app/(app)/settings/up-connection/page.tsx`

- [ ] **Step 1: Read sync_state per account**, render a colored badge next to the balance:
  - 🟢 CURRENT
  - 🟡 STALE_PARTIAL — show "Some data missing — auto-retry queued" tooltip
  - 🔴 SYNC_FAILED_PERMANENT — show "Up Bank can't return data for this — contact support@up.com.au with reference {account_id}"
  - 🔵 SYNCING — currently fetching
  - ⚪ IDLE — never synced

- [ ] **Step 2: Test**: render component with each state, snapshot.
- [ ] **Step 3: Commit**

---

## Task 8: 401-cascade on token revocation

**Files:**
- Modify: `src/app/api/upbank/sync/route.ts` (in the outer 401 catch)

- [ ] **Step 1: When `UpUnauthorizedError`** thrown:

```ts
// Mark all user's accounts as STALE_PARTIAL
const supabase = createServiceRoleClient();
await supabase.from("accounts")
  .update({ sync_state: "STALE_PARTIAL", sync_last_error: "Up Bank token revoked" })
  .eq("user_id", user.id);
await supabase.from("up_api_configs")
  .update({ is_active: false })
  .eq("user_id", user.id);
// Send Resend email "your Up Bank connection needs renewal"
```

- [ ] **Step 2: Test**: simulate 401 → verify cascade
- [ ] **Step 3: Commit**

---

## Self-review

- [ ] State transitions covered: IDLE→SYNCING, SYNCING→CURRENT, SYNCING→STALE_PARTIAL, *→SYNC_FAILED_PERMANENT, CURRENT→STALE_PARTIAL on 401
- [ ] Reconciliation cron actually retries
- [ ] Sync runner extracted from route handler so cron can call it
- [ ] Admin page surfaces problem users
- [ ] All idempotent — re-running converges

## Acceptance criteria

- [ ] After sync run, `sync_runs` + `sync_account_attempts` have correct rows
- [ ] User in STALE_PARTIAL gets auto-fixed by reconciliation cron the next morning
- [ ] PAT revocation cascades to all accounts + email sent
- [ ] /settings/up-connection shows colored state badges
- [ ] /admin/sync-stragglers lists problem users
- [ ] Existing tests still pass (1400+)
