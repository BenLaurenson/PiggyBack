# Multi-Tenant Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` tracking.

**Goal:** End-to-end automated tenant provisioning. New piggyback.finance signup → fresh Supabase + Vercel + migrations + subdomain + first deploy → ready for use, all under 2 min, idempotent + resumable.

**Architecture:** State machine in `piggyback_provisions.state`. Worker cron picks up non-terminal provisions, advances each by one step. State + transient context in `state_data jsonb`. Pre-flight checks block premature progression.

---

**Spec:** `docs/superpowers/specs/2026-05-01-05-multi-tenant-provisioning-design.md`. **Depends on:** plans #1, #2, #3.

---

## File structure

**New:**
- `src/lib/provisioner/worker.ts` — single-step state-machine advancer
- `src/lib/provisioner/__tests__/worker.test.ts`
- `src/lib/provisioner/supabase-mgmt.ts` — wrapper around Supabase Mgmt API with idempotency keys
- `src/lib/provisioner/vercel-mgmt.ts` — wrapper around Vercel API with idempotency
- `src/lib/provisioner/migration-runner.ts` — applies our `supabase/migrations/*.sql` to a fresh project
- `src/app/api/admin/provision-worker/route.ts` — cron endpoint
- `supabase/migrations/20260501000007_provision_state_machine.sql`

**Modify:**
- `src/lib/provisioner/state-machine.ts` — extend with new states + transition helpers
- `src/app/api/stripe/webhook/route.ts` — Stripe `checkout.session.completed` advances NEW → STRIPE_PAID
- `src/app/oauth/supabase/callback/route.ts` — store token, advance to AWAITING_VERCEL_OAUTH
- `src/app/oauth/vercel/callback/route.ts` — store token, advance to SUPABASE_CREATING (worker takes it from here)
- `src/app/admin/provisions/` — new admin UI (or extend existing)
- `vercel.json` — add provision-worker cron

---

## Task 1: Migration — provision state column expansion

**Files:**
- Create: `supabase/migrations/20260501000007_provision_state_machine.sql`

- [ ] **Step 1: SQL**

```sql
-- 20260501000007_provision_state_machine.sql

-- Existing piggyback_provisions has `state text` already; widen the CHECK
ALTER TABLE public.piggyback_provisions
  DROP CONSTRAINT IF EXISTS piggyback_provisions_state_check;
ALTER TABLE public.piggyback_provisions
  ADD CONSTRAINT piggyback_provisions_state_check
  CHECK (state IN (
    'NEW','STRIPE_CHECKOUT_OPEN','STRIPE_PAID',
    'AWAITING_SUPABASE_OAUTH','AWAITING_VERCEL_OAUTH',
    'SUPABASE_CREATING','MIGRATIONS_RUNNING',
    'VERCEL_CREATING','VERCEL_ENV_SET','DOMAIN_ATTACHING','INITIAL_DEPLOY',
    'READY','FAILED_RETRYABLE','FAILED_PERMANENT','CANCELLED'
  ));

ALTER TABLE public.piggyback_provisions
  ADD COLUMN IF NOT EXISTS state_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS provision_state_pickup_idx
  ON public.piggyback_provisions(state, next_retry_at)
  WHERE state IN ('FAILED_RETRYABLE','SUPABASE_CREATING','MIGRATIONS_RUNNING','VERCEL_CREATING','VERCEL_ENV_SET','DOMAIN_ATTACHING','INITIAL_DEPLOY');

-- Resource usage counter table for daily cost tracking
CREATE TABLE IF NOT EXISTS public.provision_resource_usage (
  date date NOT NULL,
  resource_type text NOT NULL,
  call_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (date, resource_type)
);
GRANT ALL ON public.provision_resource_usage TO service_role;
```

- [ ] **Step 2: Apply, verify**
- [ ] **Step 3: Commit**

---

## Task 2: Supabase Mgmt API wrapper

**Files:**
- Create: `src/lib/provisioner/supabase-mgmt.ts`
- Test: `src/lib/provisioner/__tests__/supabase-mgmt.test.ts`

- [ ] **Step 1: Tests cover**:
  - `createSupabaseProject(args)` posts with idempotency key, returns project ref + DB URL
  - `pollProjectStatus(ref)` polls `GET /projects/{ref}` until `status === 'ACTIVE_HEALTHY'`, timeout 5min
  - `applyMigration(ref, sql, name)` posts to `/projects/{ref}/database/migrations`
  - `getProjectKeys(ref)` returns anon + service-role keys
  - All call `incrementResourceUsage('supabase_mgmt')`

- [ ] **Step 2: Implement**

Use the user's stored Supabase OAuth refresh token (from `provision_oauth_tokens`) to authenticate every call. Refresh-on-401.

- [ ] **Step 3: Commit**

---

## Task 3: Vercel Mgmt API wrapper

**Files:**
- Create: `src/lib/provisioner/vercel-mgmt.ts`
- Test: `src/lib/provisioner/__tests__/vercel-mgmt.test.ts`

- [ ] **Step 1: Tests + implement**:
  - `createVercelProject(args)` — POST /v9/projects with team token, idempotency key
  - `setEnvVars(projectId, vars[])` — bulk POST /v10/projects/{id}/env
  - `attachDomain(projectId, domain)` — POST /v10/projects/{id}/domains
  - `triggerDeployment(projectId, gitRef)` — POST /v13/deployments
  - `pollDeploymentStatus(deploymentId)` — until READY or ERROR
  - All increment `provision_resource_usage`

- [ ] **Step 2: Commit**

---

## Task 4: Migration runner

**Files:**
- Create: `src/lib/provisioner/migration-runner.ts`
- Test: `src/lib/provisioner/__tests__/migration-runner.test.ts`

- [ ] **Step 1: Implementation**

```ts
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { applyMigration } from "./supabase-mgmt";

export async function runAllMigrations(projectRef: string, oauthToken: string): Promise<{ applied: string[]; failed: { name: string; error: string }[] }> {
  const dir = join(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf-8");
    try {
      await applyMigration(projectRef, sql, file, oauthToken);
      applied.push(file);
    } catch (e) {
      failed.push({ name: file, error: String(e) });
      // Stop on first failure — subsequent migrations may depend on this one
      break;
    }
  }
  return { applied, failed };
}
```

- [ ] **Step 2: Test** with mocked `applyMigration` — verify ordering, fail-stops-loop
- [ ] **Step 3: Commit**

---

## Task 5: Worker — single-step advancer

**Files:**
- Create: `src/lib/provisioner/worker.ts`
- Test: `src/lib/provisioner/__tests__/worker.test.ts`

- [ ] **Step 1: Function shape**

```ts
export async function advanceProvision(provisionId: string): Promise<{ from: string; to: string; data?: any }> {
  const provision = await getProvisionById(provisionId);
  if (!provision) throw new Error("not found");
  switch (provision.state) {
    case "STRIPE_PAID":           return await advanceStripePaid(provision);
    case "AWAITING_SUPABASE_OAUTH": return { from: provision.state, to: provision.state }; // user-driven
    case "SUPABASE_CREATING":      return await advanceSupabaseCreating(provision);
    case "MIGRATIONS_RUNNING":     return await advanceMigrationsRunning(provision);
    case "VERCEL_CREATING":        return await advanceVercelCreating(provision);
    case "VERCEL_ENV_SET":         return await advanceVercelEnvSet(provision);
    case "DOMAIN_ATTACHING":       return await advanceDomainAttaching(provision);
    case "INITIAL_DEPLOY":         return await advanceInitialDeploy(provision);
    case "FAILED_RETRYABLE":       return await advanceFailedRetryable(provision);
    default:                       return { from: provision.state, to: provision.state }; // terminal or user-driven
  }
}
```

- [ ] **Step 2: Implement each `advance*` function**

Each function:
1. Validates pre-conditions (e.g., `state_data.supabase_project_ref` exists for `MIGRATIONS_RUNNING`)
2. Calls the relevant Mgmt API wrapper
3. Updates `piggyback_provisions.state` + `state_data` via `WHERE state = expected_from_state` for optimistic concurrency
4. Writes audit row
5. Catches errors → either FAILED_RETRYABLE (incrementing `retry_count`, setting `next_retry_at`) or FAILED_PERMANENT for unrecoverable failures (e.g., 401 OAuth)

- [ ] **Step 3: Tests** for each transition

A representative test for `advanceSupabaseCreating`:

```ts
it("advances SUPABASE_CREATING → MIGRATIONS_RUNNING when project becomes ACTIVE_HEALTHY", async () => {
  pollProjectStatusMock.mockResolvedValue("ACTIVE_HEALTHY");
  getProjectKeysMock.mockResolvedValue({ anon: "anon", serviceRole: "sr", url: "https://x.supabase.co" });
  const result = await advanceProvision("p1");
  expect(result.to).toBe("MIGRATIONS_RUNNING");
  expect(updateProvisionMock).toHaveBeenCalledWith("p1", {
    state: "MIGRATIONS_RUNNING",
    state_data: expect.objectContaining({
      supabase_project_ref: expect.any(String),
      supabase_anon_key: "anon",
      supabase_url: "https://x.supabase.co",
    }),
  }, "SUPABASE_CREATING");
});
```

- [ ] **Step 4: Commit**

---

## Task 6: Worker cron + admin endpoint

**Files:**
- Create: `src/app/api/admin/provision-worker/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Cron handler**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { advanceProvision } from "@/lib/provisioner/worker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceRoleClient();
  const { data: pickups } = await supabase
    .from("piggyback_provisions")
    .select("id, state")
    .in("state", ["FAILED_RETRYABLE","SUPABASE_CREATING","MIGRATIONS_RUNNING","VERCEL_CREATING","VERCEL_ENV_SET","DOMAIN_ATTACHING","INITIAL_DEPLOY"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .limit(20);

  const results: any[] = [];
  for (const p of pickups ?? []) {
    try {
      const r = await advanceProvision(p.id);
      results.push({ id: p.id, ...r });
    } catch (e) {
      results.push({ id: p.id, error: String(e) });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
```

- [ ] **Step 2: Add cron entry** to vercel.json

```json
{ "path": "/api/admin/provision-worker", "schedule": "*/5 * * * *" }
```

(Hobby tier won't allow */5; on Pro it will. For Hobby use `0 * * * *` — hourly.)

- [ ] **Step 3: Test the cron handler** with mocked supabase + advanceProvision
- [ ] **Step 4: Commit**

---

## Task 7: Wire OAuth callbacks to advance state

**Files:**
- Modify: `src/app/oauth/supabase/callback/route.ts`
- Modify: `src/app/oauth/vercel/callback/route.ts`

- [ ] **Step 1: Supabase OAuth callback** — after token exchange + store, transition `AWAITING_SUPABASE_OAUTH → AWAITING_VERCEL_OAUTH`. Redirect user to Vercel OAuth.
- [ ] **Step 2: Vercel OAuth callback** — after store, transition `AWAITING_VERCEL_OAUTH → SUPABASE_CREATING`. Redirect to a "Setting up your account…" loading page. The worker takes it from there.
- [ ] **Step 3: Tests**: each callback's effects (call `audit`, transition state, redirect URL)
- [ ] **Step 4: Commit**

---

## Task 8: Stripe webhook → STRIPE_PAID

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: On `checkout.session.completed`**, find the provision via `state_data.stripe_session_id`, transition `STRIPE_CHECKOUT_OPEN → STRIPE_PAID`. The worker is NOT involved here — this is a user-facing redirect → next step is OAuth, which is user-driven.

Actually rethinking: STRIPE_PAID auto-advances to AWAITING_SUPABASE_OAUTH. The user is redirected to the Supabase consent URL after Stripe webhook fires. So:
- Stripe webhook: STRIPE_CHECKOUT_OPEN → STRIPE_PAID → AWAITING_SUPABASE_OAUTH (auto)
- User landing back on the orchestrator post-Stripe: server-rendered page reads provision state, redirects to Supabase consent URL

- [ ] **Step 2: Tests**
- [ ] **Step 3: Commit**

---

## Task 9: Admin provisions page

**Files:**
- Create: `src/app/admin/provisions/page.tsx`
- Create: `src/app/api/admin/provisions/route.ts` (GET list + POST advance/cancel)

- [ ] **Step 1: API**: returns paginated `piggyback_provisions` rows with state + last_attempt_at + retry_count. Action endpoints: POST `/api/admin/provisions/{id}/retry`, POST `/api/admin/provisions/{id}/cancel`.
- [ ] **Step 2: Page**: table with state badges, actions per row.
- [ ] **Step 3: Tests + commit**

---

## Task 10: Pre-flight checks before SUPABASE_CREATING

**Files:**
- Modify: `src/lib/provisioner/worker.ts` (`advanceVercelOAuthCallback` → SUPABASE_CREATING transition)

- [ ] **Step 1: Implement preflight**:
  - User email is verified (orchestrator auth)
  - Stripe sub status === 'active' or 'trialing' (call Stripe API with stored sub_id)
  - Daily Supabase mgmt API quota < 80% used
  - No existing READY provision for this user (idempotent — return existing)

- [ ] **Step 2: Test the preflight failures** prevent advancement.
- [ ] **Step 3: Commit**

---

## Task 11: Tear-down on cancellation

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts` (handle `customer.subscription.deleted`)
- Create: `src/app/api/cron/release-cancelled-provisions/route.ts`

- [ ] **Step 1: On subscription deletion**: mark provision `state='CANCELLED'`, set `state_data.cancelled_at = now()`. Don't tear down resources yet.
- [ ] **Step 2: Daily cron** finds CANCELLED provisions where `cancelled_at < 14 days ago`, detaches custom domain via Vercel API, marks `state_data.domain_released = true`. Doesn't delete user's Supabase or Vercel project — they keep them.
- [ ] **Step 3: Email user** "Your hosted PiggyBack is now self-managed".
- [ ] **Step 4: Tests + commit**

---

## Task 12: End-to-end provisioning test

**Files:**
- Create: `src/lib/provisioner/__tests__/e2e-flow.test.ts`

- [ ] **Step 1: Dry-run mode**

Add an env var `PROVISIONER_DRY_RUN=true` that mocks all external API calls (Supabase Mgmt, Vercel) and returns fake successful responses. Lets us run the full state machine end-to-end in tests without hitting real APIs.

- [ ] **Step 2: Test**: simulates a full provisioning from NEW → READY in dry-run, asserts every state transition + state_data accumulates correctly.

- [ ] **Step 3: Commit**

---

## Self-review

- [ ] All 15 states defined in spec have corresponding worker transitions
- [ ] Idempotency: same user signing up twice → same provision_id, no duplicates
- [ ] Pre-flight checks block Supabase creation if Stripe failed
- [ ] Worker handles 401 (OAuth refresh) and 4xx (FAILED_PERMANENT) appropriately
- [ ] Cron picks up FAILED_RETRYABLE with backoff
- [ ] Tear-down preserves user's data (domain detach only, no project delete)
- [ ] Dry-run mode lets tests run without burning real Supabase/Vercel quota

## Acceptance criteria

- [ ] Full flow works in dry-run (`PROVISIONER_DRY_RUN=true`)
- [ ] Worker recovers from killed-mid-run by reading state and resuming
- [ ] Stripe webhook → state advancement works
- [ ] OAuth callbacks store tokens + advance state
- [ ] Admin page shows in-flight provisions, allows manual retry
- [ ] Cancellation flow detaches domain after 14d but keeps user's resources
