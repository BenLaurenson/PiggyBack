# Multi-Tenant Provisioning — Design Spec

> **Sub-spec 5 of 5.** Builds on Data Architecture (#1), Identity (#2), Onboarding (#3).
> Status: drafted 2026-05-01.
> Implementation plan: `2026-05-01-05-multi-tenant-provisioning-plan.md`.
>
> Big chunks of this already exist in skeleton form (`src/lib/provisioner/state-machine.ts`,
> `src/app/oauth/{supabase,vercel}/callback/route.ts`). This spec defines the target
> behavior + fills the gaps that prevent end-to-end working today.

## What this spec answers

How do we automate "create a new Supabase project + Vercel project + apply migrations + attach subdomain + redirect" in a way that's:

- Idempotent (same signup retried = same provision, not duplicates)
- Resumable (Supabase succeeds + Vercel fails → retry resumes from after Supabase)
- Observable (admin can see exactly what state every provision is in)
- Recoverable (broken provisions can be retried, abandoned, or migrated to fresh resources)
- Bounded (won't burn through OAuth quotas or rack up costs unintentionally)

## High-level flow

```
piggyback.finance signup (orchestrator-side)
         │
         ▼
┌───────────────────────┐
│ NEW                   │  user just signed up; no resources allocated
└───────┬───────────────┘
        ▼
┌───────────────────────┐
│ STRIPE_CHECKOUT_OPEN  │  redirected to Stripe Checkout
└───────┬───────────────┘
        ▼
┌───────────────────────┐
│ STRIPE_PAID           │  webhook received checkout.session.completed
└───────┬───────────────┘
        ▼
┌─────────────────────────────────┐
│ AWAITING_SUPABASE_OAUTH         │  user redirected to Supabase consent
└───────┬─────────────────────────┘
        ▼
┌─────────────────────────────────┐
│ AWAITING_VERCEL_OAUTH           │  user redirected to Vercel consent
└───────┬─────────────────────────┘
        ▼
┌────────────────────┐
│ SUPABASE_CREATING  │  POST /v1/projects ... waits ACTIVE_HEALTHY
└───────┬────────────┘
        ▼
┌────────────────────┐
│ MIGRATIONS_RUNNING │  applies all supabase/migrations/*.sql to new project
└───────┬────────────┘
        ▼
┌────────────────────┐
│ VERCEL_CREATING    │  POST /v9/projects ... links to BenLaurenson/PiggyBack
└───────┬────────────┘
        ▼
┌────────────────────┐
│ VERCEL_ENV_SET     │  sets all required env vars (Supabase URL/keys, encryption keys, etc.)
└───────┬────────────┘
        ▼
┌────────────────────┐
│ DOMAIN_ATTACHING   │  attaches {shortid}.piggyback.finance via team token
└───────┬────────────┘
        ▼
┌────────────────────┐
│ INITIAL_DEPLOY     │  triggers first deployment, waits READY
└───────┬────────────┘
        ▼
┌────────────────────┐
│ READY              │  user can now sign into their tenant
└────────────────────┘

Any state can transition to:
  FAILED_RETRYABLE (transient failure, retry queued)
  FAILED_PERMANENT (token revoked, quota exceeded — needs admin)
  CANCELLED (user clicked Cancel, or churn after Stripe sub deleted)
```

## What already exists

`src/lib/provisioner/state-machine.ts` defines a similar enum and helpers. The codebase has:
- `upsertProvisionForUser` — creates the orchestrator-side row
- `addProjectDomain` — calls Vercel API to attach a custom domain
- `audit` — writes to `provision_audit`
- `getProvisionById`
- OAuth callbacks for Supabase + Vercel that store tokens

What's missing or partial:
- The actual creation calls to Supabase Mgmt API + Vercel API for project creation
- The migration runner that applies our `supabase/migrations/*.sql` to a fresh project
- The env-var setup (lots of vars; need to enumerate them all)
- The initial-deploy trigger + wait-for-ready
- A worker that drives a provision through states (currently the OAuth callback fires the next step, but failures aren't auto-retried)
- A provisioning admin UI

## Schema additions to orchestrator DB

```sql
ALTER TABLE piggyback_provisions
  ADD COLUMN state text NOT NULL DEFAULT 'NEW' CHECK (state IN (
    'NEW','STRIPE_CHECKOUT_OPEN','STRIPE_PAID',
    'AWAITING_SUPABASE_OAUTH','AWAITING_VERCEL_OAUTH',
    'SUPABASE_CREATING','MIGRATIONS_RUNNING',
    'VERCEL_CREATING','VERCEL_ENV_SET','DOMAIN_ATTACHING','INITIAL_DEPLOY',
    'READY','FAILED_RETRYABLE','FAILED_PERMANENT','CANCELLED'
  )),
  ADD COLUMN state_data jsonb DEFAULT '{}'::jsonb,
    -- transient state-specific context, e.g. { supabase_project_ref, deployment_url }
  ADD COLUMN state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN next_retry_at timestamptz;

-- provision_audit already exists. Add a worker pickup index:
CREATE INDEX provision_state_pickup_idx
  ON piggyback_provisions(state, next_retry_at)
  WHERE state IN ('FAILED_RETRYABLE','SUPABASE_CREATING','MIGRATIONS_RUNNING','VERCEL_CREATING','VERCEL_ENV_SET','DOMAIN_ATTACHING','INITIAL_DEPLOY');
```

## State transitions: who fires them

Every transition is one of three patterns:

1. **User-driven** (user clicks something, server action transitions): NEW → STRIPE_CHECKOUT_OPEN, AWAITING_SUPABASE_OAUTH → AWAITING_VERCEL_OAUTH (after callback), etc.
2. **Webhook-driven** (Stripe webhook, Up Bank webhook): STRIPE_CHECKOUT_OPEN → STRIPE_PAID
3. **Worker-driven** (background cron pulls from `state_pickup_idx`): SUPABASE_CREATING → MIGRATIONS_RUNNING (after polling Supabase project status), etc.

The worker is a single Vercel cron entry running `/api/admin/provision-worker?lease=true` every 5 minutes (currently we'd run daily on Hobby; once on Pro, every 5min). It claims a small batch of provisions in non-terminal states, advances each one step, releases.

## Idempotency strategy

Every state-changing API call uses an idempotency-key built from `provision_id + target_state`. Examples:
- Supabase project create: idempotency-key = `provision-{provision_id}-supabase-create`
- Vercel project create: idempotency-key = `provision-{provision_id}-vercel-create`
- Vercel deployment trigger: same pattern

If the API call already happened, we get the existing resource back instead of creating a duplicate. State-changes update via `WHERE state = expected_from_state` for optimistic concurrency.

## Required Vercel env vars per tenant

This list is what every new tenant Vercel project needs. The provisioning flow sets all of these. Validated against `src/lib/env.ts`:

- `NEXT_PUBLIC_SUPABASE_URL` — from the new tenant Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from the new tenant Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — from the new tenant Supabase. Stored in Vercel only, NOT retained in orchestrator post-provision.
- `UP_API_ENCRYPTION_KEY` — generated fresh per tenant via `crypto.randomBytes(32).toString('hex')`. The user's PAT will be encrypted with this in their tenant DB.
- `PROVISIONER_ENCRYPTION_KEY` — same pattern. Per-tenant.
- `NEXT_PUBLIC_APP_URL` — `https://{shortid}.piggyback.finance`
- `CRON_SECRET` — random 32 bytes, used for cron auth
- `ADMIN_EMAILS` — set to the user's own email (for /admin gating in their own tenant)
- `RESEND_API_KEY` — orchestrator-shared (we email on the user's behalf for welcome / cancellation feedback). User can override in their settings later.
- `RESEND_FROM` — `hello@piggyback.finance`
- `NEXT_PUBLIC_HOSTED_ENABLED` — empty for tenant deploys (only orchestrator gets this)
- `STRIPE_*` — empty for tenant deploys (orchestrator handles billing)
- `NEXT_PUBLIC_ANALYTICS_ENABLED` + `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` — orchestrator-shared if user opted in; empty otherwise

Crucially: `STRIPE_*` is never set on tenant deploys. Stripe lives only on the orchestrator. Tenant doesn't know about billing.

## Migration application

When a new Supabase is created, we apply ALL migrations in `supabase/migrations/` in lexicographic order. The orchestrator has a worker that:

1. Connects to the new project via the user's Supabase OAuth refresh token
2. Calls `POST /v1/projects/{ref}/database/migrations` with each migration file
3. Records `applied_migrations` per provision in orchestrator DB
4. On every release with new migrations, the propagate-migrations cron (already exists) runs each unapplied migration on every READY provision

For migration failures (e.g., schema conflict because user has manual edits), we log + alert but don't auto-retry. Admin investigates.

## Initial deployment

After env vars are set + domain attached, we trigger a deployment:

```
POST https://api.vercel.com/v13/deployments?teamId={user_team_id}&forceNew=1
{
  "name": "piggyback-{shortid}",
  "gitSource": {
    "type": "github",
    "repoId": <BenLaurenson/PiggyBack repo ID>,
    "ref": "main"  // or whatever the orchestrator's HOSTED_TRACK_BRANCH is
  },
  "target": "production"
}
```

Worker polls deployment status every 10s up to 5min. If READY → state advances to READY. If ERROR → audit + state to FAILED_RETRYABLE.

## OAuth scope minimization

Supabase OAuth scopes we need: `projects:write`, `database:write`, `secrets:write`. After provisioning is complete, we do NOT need `secrets:write` anymore (only for migration propagation, where we re-fetch via the refresh token on demand). Document this in the OAuth consent screen.

Vercel OAuth scopes: project create + env management + domain management. Same — after provisioning, we only need read + redeploy.

We DO retain the OAuth refresh tokens long-term for migration propagation. They're encrypted at rest in `provision_oauth_tokens`.

## Pre-flight checks before allocation

Before kicking off Supabase project creation, verify:
- User's email is verified (via Supabase orchestrator auth)
- Stripe payment is in `paid` state, not `payment_failed`
- User's Stripe subscription's `status === 'active'` or `'trialing'`
- Orchestrator's Supabase OAuth has remaining quota (we'll add a daily counter; warn at 80% of quota)
- No existing READY provision for this user (idempotent — return existing)

If any pre-flight fails: state stays at the current step, admin alert.

## Failure recovery

Three buckets:

1. **Transient failure** (network, 5xx) → state goes FAILED_RETRYABLE, `next_retry_at = now() + (retry_count * 5min)`. Worker picks it up.
2. **Quota exhaustion** (Supabase mgmt API rate limit) → state stays at current step, `next_retry_at = now() + 1h`.
3. **Permanent failure** (OAuth refused, invalid scope, project create returns 4xx with non-retryable) → state goes FAILED_PERMANENT. Admin gets notified via Slack/email. User sees "Something went wrong setting up your account — we'll be in touch within 24h."

Admin actions on FAILED_PERMANENT:
- Manual restart from a specific state (e.g., "Supabase OAuth has been refreshed, retry from SUPABASE_CREATING")
- Mark CANCELLED + refund Stripe
- Adopt an existing Supabase project (manually pre-created) into the provision

## Tear-down on cancellation

When `customer.subscription.deleted` fires from Stripe (user cancelled):

1. Orchestrator marks `state = CANCELLED`.
2. After a 14-day grace period (configurable):
   - Detach `{shortid}.piggyback.finance` from the user's Vercel project
   - Mark provision as fully closed
3. **We do NOT delete the user's Supabase or Vercel projects.** They keep them. They can re-attach a custom domain themselves or just keep using the Vercel-assigned URL.
4. Email user: "Your hosted PiggyBack is now self-managed. Your data and infra are intact in your Supabase + Vercel accounts. Re-subscribe anytime."

This is the killer feature — cancellation isn't destructive. Users keep their data + infra.

## Cost & quota tracking

`provision_resource_usage` (NEW) — per-day counters:
- Supabase mgmt API calls
- Vercel API calls
- New provisions created

Admin dashboard surfaces these. Alerts at 80% of daily quota.

## Pre-warmed pool (deferred to post-MVP)

90 seconds is a long time to wait. Optimization: keep a small pool (e.g., 3) of pre-created Supabase projects in a "warm" state. On signup, claim one from the pool, refill async. Provisioning becomes ~5s for the user.

Out of scope for MVP. Cold provisioning is acceptable v1.

## Acceptance criteria

- [ ] A user signing up at piggyback.finance with valid Stripe + valid OAuth → READY in <2 min
- [ ] Killing the worker mid-provisioning → next worker run resumes from the same state
- [ ] Stripe payment fail → provision halts, user gets actionable error
- [ ] OAuth refused → FAILED_PERMANENT, admin notified
- [ ] Cancellation → 14-day grace, then domain detached but resources retained
- [ ] Admin can see all in-flight provisions + manually intervene
- [ ] Provisioner runs idempotently — same user signing up twice gets one provision
- [ ] Migration propagation works on existing READY provisions when a new migration lands

## Test strategy

- Unit: state transition validation, idempotency-key construction, env-var enumeration
- Integration: dry-run mode that simulates the full flow without actually creating Supabase/Vercel resources (uses fixtures). Asserts state machine reaches READY.
- E2E (requires infra): a single end-to-end provision with throwaway resources. Run nightly in a non-prod env. Tear down at the end.
- Failure injection: every step has a "kill the worker mid-call" test that asserts resumption from the right state.
- Cost test: run 100 simulated signups in dry-run, assert no calls to actual Supabase/Vercel APIs.
