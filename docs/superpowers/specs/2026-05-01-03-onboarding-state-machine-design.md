# Onboarding State Machine — Design Spec

> **Sub-spec 3 of 5.** Builds on Data Architecture (#1) and Identity (#2).
> Status: drafted 2026-05-01.
> Implementation plan: `2026-05-01-03-onboarding-state-machine-plan.md`.

## What this spec answers

How does a brand-new user go from "I just signed up" to "my data is loaded and I'm using the app", with every edge case handled?

The current onboarding (`OnboardingWizard` + step components) was patched tonight to be hydration-aware and skip-completed-steps, but it's still a fragile FE-state machine. This spec defines a durable BE-driven state machine that:
- Survives tab close, refresh, server restart
- Resumes from anywhere
- Is idempotent
- Provides a single source of truth for "is this user ready?"
- Makes orchestrator ↔ tenant handoff explicit

## State machine

```
    ┌─────────┐
    │  NEW    │  user just signed up at piggyback.finance
    └────┬────┘
         │ orchestrator handoff token created
         ▼
    ┌──────────────────┐
    │  PROVISIONING    │  spec #5 — Supabase + Vercel + migrations
    └────┬─────────────┘
         │ tenant ready, redirect to {shortid}.piggyback.finance/onboarding
         ▼
    ┌─────────┐
    │ PROFILE │  enter display_name, optionally avatar
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │  BANK   │  enter Up Bank PAT, sync runs
    └────┬────┘
         │ at least one account synced (others may be partial)
         ▼
    ┌──────────┐
    │  INCOME  │  optional: configure recurring salary so partner-split + budget work
    └────┬─────┘
         │ user clicks Next (with or without income)
         ▼
    ┌─────────┐
    │   AI    │  optional: bring-your-own-key for Penny
    └────┬────┘
         │ user clicks Next
         ▼
    ┌──────────┐
    │  PARTNER │  optional: invite real partner / configure manual
    │          │  (NEW step — currently lives in /settings/partner only)
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │  READY   │  has_onboarded=true, redirect to /home
    └──────────┘

    Any state → ABANDONED if no progress for 7 days, surfaces in admin
```

### Why a BE state machine, not just FE booleans

The current code derives state from {`profile.has_onboarded`, `up_api_configs.is_active`, `accounts COUNT > 0`, `income_sources COUNT > 0`}. It's a *projection* of the state machine, but the projection is computed in two places (the page that hydrates the wizard, and the wizard itself), and they can disagree.

The new model: a single `onboarding_state` column on `profiles` with the explicit enum + `onboarding_state_data jsonb` for transient context (e.g., the encrypted PAT mid-flow). State transitions go through a small SQL function (`set_onboarding_state(new_state, data)`) that validates the transition + writes an audit row. Components READ from this column.

## Schema additions to tenant Supabase

```sql
ALTER TABLE profiles
  ADD COLUMN onboarding_state text NOT NULL DEFAULT 'PROVISIONING'
    CHECK (onboarding_state IN ('PROVISIONING','PROFILE','BANK','INCOME','AI','PARTNER','READY','ABANDONED')),
  ADD COLUMN onboarding_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN onboarding_state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN onboarding_completion_path text[];
  -- e.g. ['PROVISIONING','PROFILE','BANK','INCOME','READY'] = user took the
  -- happy path. Useful for funnel analysis. We don't fire PostHog events
  -- from inside the BE state machine — that's the job of /api/analytics/track
  -- — but the audit trail lets us reconstruct the funnel post-hoc.

CREATE TABLE onboarding_state_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  reason text,         -- 'user_action' | 'auto_skip' | 'timeout' | 'admin_reset'
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX onboarding_state_audit_user_id_idx ON onboarding_state_audit(user_id, occurred_at DESC);
```

## Transitions: who fires them

- `NEW → PROVISIONING`: orchestrator-side, when the signup completes. Doesn't touch tenant DB (tenant doesn't exist yet).
- `PROVISIONING → PROFILE`: orchestrator's provisioning state machine sets initial `onboarding_state='PROFILE'` when migrations finish, before the tenant app first loads.
- `PROFILE → BANK`: tenant server action, when user submits the profile form.
- `BANK → INCOME`: tenant server action, when the sync stream fires `phase: done` AND at least one account has `last_synced_at NOT NULL`. Important: partial syncs that get any data through still advance — the user can re-sync stragglers later. Sync error with zero accounts → no transition.
- `INCOME → AI`: tenant server action when user clicks "Next" on Income step. Income config is optional; the transition happens regardless.
- `AI → PARTNER`: same — AI step is skippable.
- `PARTNER → READY`: tenant server action when user clicks "Done" on Partner step (they may have invited a partner, configured manual, or skipped entirely).
- `* → ABANDONED`: cron job. If `onboarding_state_changed_at < now() - interval '7 days'` AND state != READY, mark ABANDONED. Surfaces in `/admin/funnel` as drop-off.
- `ABANDONED → PROFILE`: user signs back in → they get a "Welcome back, want to continue setting up?" prompt → click Continue → state resumes from where they left.

## Backwards transition

Users can navigate to a previous step (e.g., go back from Bank to Profile to fix display name). This DOES NOT change `onboarding_state` — they can edit but don't regress the state. The state column is "highest step reached", not "currently visible step".

If the user wants to fully reset onboarding (e.g., to retry from scratch), `/settings/account` has a "Reset onboarding" button that sets `onboarding_state='PROFILE'` (preserving their data). They run through the wizard again. Less destructive than account deletion.

## Concurrency: two devices racing during onboarding

Edge case: user signs up on phone, then opens laptop, both connect during the BANK step. Both submit a sync request.

Handling:
- The sync route already has rate limiting (6/5min per user).
- The `set_onboarding_state` SQL function uses `WHERE onboarding_state = expected_from_state` — only one transition succeeds. The losing call gets the existing value back.
- The wizard reads state on every page load — losing client just reflects the truth.

## Server actions

```
persistOnboardingStep(stepId)        — already exists; deprecate in favor of:

advanceOnboardingState(toState)
  Validates transition. Writes audit row. Updates profiles.
  Returns { ok: true, currentState } | { ok: false, currentState, reason }

resetOnboarding()
  Admin or self-serve. Sets onboarding_state='PROFILE'.

getOnboardingState()
  Server component data fetch. Returns full state + audit.
```

## OnboardingWizard component changes

The wizard becomes a *thin renderer over the state*:
- It reads `onboarding_state` from the profile.
- It maps state → step component to render.
- "Next" calls `advanceOnboardingState` then refreshes server data (Next.js `revalidatePath`).
- "Back" navigates client-side without changing state.
- No FE-side `completedSteps` state (the BE is the source of truth).

This kills a class of bugs where the FE state and BE state diverge.

## Special handling: BANK step

The BANK step is special because:
- It runs the actual sync (which can be slow, partial, or fail)
- The user might leave during sync (stream gets disconnected)
- Sync failures should NOT block onboarding — partial data is enough to continue

Logic:
- User submits PAT.
- `connectUpBank` server action validates + encrypts + stores PAT. Returns success.
- Sync stream begins. UI shows progress.
- When `phase: done` arrives:
  - If at least one account has `last_synced_at NOT NULL` → call `advanceOnboardingState('INCOME')` and offer "Continue to Income". Errors are surfaced (yellow banner) but don't block.
  - If zero accounts succeeded → stay in BANK state, show retry UI.
- If user leaves mid-sync (closes tab):
  - Sync route continues running on the server until `maxDuration=300s`.
  - Sync DOES NOT advance the state when complete — the FE wasn't there to call `advanceOnboardingState`.
  - Next page load: hydration sees data is in DB but state is still BANK. UI shows "Looks like you started syncing earlier — continue?" with a button that calls `advanceOnboardingState('INCOME')`.

This means: data in DB + state advancement are decoupled. The state machine reflects user *intent*, the data reflects what got fetched.

## INCOME step nuance

Income is currently optional but de-facto critical for partner splits. New copy: "Optional but recommended — partner-aware budgeting needs at least one income source. Skip if you'll come back later."

If the user skips, on the dashboard a small persistent banner appears: "Add your income to unlock partner splits and goal projections." Banner is dismissible — dismissal sets a `dismissed_income_banner_at` flag.

## PARTNER step (NEW)

Currently `/settings/partner` is the only partner-config surface. Adding this as an onboarding step makes 2Up discoverable upfront.

Three options:
- **Solo for now** → state PARTNER → READY immediately
- **I have a partner who'll use PiggyBack** → email field → "Send invite" → state PARTNER → READY (invitation pending in background)
- **I have a partner but they won't use it** → manual partner form (name, optional DOB, etc.) → state PARTNER → READY

This step should be shippable independently of the rest. If the partner-claim infra (spec #2) isn't ready, the email option just disables.

## ABANDONED state + recovery

Cron at 02:00 UTC daily:
```sql
UPDATE profiles
SET onboarding_state = 'ABANDONED'
WHERE onboarding_state NOT IN ('READY', 'ABANDONED')
  AND onboarding_state_changed_at < now() - interval '7 days';
```

Then send a "We noticed you didn't finish setting up — your data is still here" email via Resend.

When the user signs back in:
- `/onboarding` page detects ABANDONED state.
- Shows a "Welcome back" screen with a Continue button.
- Continue → resets state to whichever step they last completed (lowest of the next-incomplete-action).

## Acceptance criteria

- [ ] Brand new signup → READY in <2 minutes (happy path) without ever showing a stale step
- [ ] Closing tab during BANK sync, reopening 1 minute later → user lands on the correct step (BANK with retry option, or INCOME if sync completed)
- [ ] Two-device concurrent onboarding → no double-state writes, no broken state
- [ ] State machine has audit trail with every transition + reason
- [ ] User can self-reset onboarding from `/settings/account`
- [ ] ABANDONED users get re-engagement email + welcome-back UI on next sign-in
- [ ] No FE state drift — `OnboardingWizard` always reads from BE state

## Test strategy

- Unit: state transition validation (legal vs illegal transitions), the SQL function's WHERE-based optimistic concurrency
- Integration: server actions for each transition, with mocked auth context
- E2E: Playwright happy-path signup → READY; abandonment + recovery; concurrent transitions from two browsers (only one wins)
- Migration: SQL upgrade from `onboarding_steps_completed` array to `onboarding_state` enum is reversible. We keep `onboarding_steps_completed` populated as a derived view for backwards compat for one release.
