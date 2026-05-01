# Data Architecture — Design Spec

> **Sub-spec 1 of 5.** Load-bearing decision; everything else falls out of this.
> Status: drafted 2026-05-01. Approved by Ben (verbally, "send it").
> Implementation plan: `2026-05-01-01-data-architecture-plan.md`.

## The decision

**Per-user Supabase. No shared transaction database. A small orchestrator DB on `piggyback.finance` holds only metadata (provisions, partner links, claim invitations).**

This is dictated by the original implementation plan — *"Up's API terms don't permit a third party to hold customer credentials and serve their data back. The Up Bank PAT lives only in the user's Vercel project env vars. It never touches our servers, never sits in our database, never appears in our logs… This is the legal foundation of why this product can exist."*

The current state (everyone shares `kbdmwkhpzrkivzjzlzzr`) is a legacy of the OSS dev prototype and a violation of the architectural pitch. This spec defines the target state and the migration path.

## What lives where

### User's own Supabase project (one per user)

Holds all the user's actual data, scoped to one or two users (the user + optionally their 2Up partner if they share an Up Bank joint account).

Schema = the existing `public.*` tables. Each user owns their full copy.

Tables:
- `accounts`, `transactions`, `transaction_tags`, `transaction_share_overrides`, `transaction_category_overrides`, `transaction_notes`
- `categories`, `category_mappings`, `merchant_category_rules`, `merchant_default_rules` (seeded on provision)
- `partnerships`, `partnership_members` (max 2 rows per partnership; user's own row + manual partner stub OR a real partner whose membership is mirrored from the orchestrator)
- `couple_split_settings`, `couple_split_overrides`
- `expense_definitions`, `expense_matches`, `budgets`, `budget_*`
- `savings_goals`, `goal_contributions`, `milestones`, `investments`, `investment_contributions`, `investment_history`, `recurring_investments`, `target_allocations`, `watchlist_items`
- `entity_tags`, `tags`, `tags_canonical`
- `income_sources`, `pay_schedules`, `net_worth_snapshots`, `annual_checkups`
- `notifications`, `methodology_customizations`, `category_pin_states`, `user_dashboard_charts`, `activity_overrides`
- `up_api_configs` (stores the user's encrypted Up PAT — never leaves their Supabase)
- `profiles` (the user's own profile)
- `partner_link_requests` (incoming claim invitations from the orchestrator)

### Orchestrator Supabase (`piggyback.finance` only)

Holds only the metadata needed to (a) provision users and (b) link partners. **Never holds transaction data, account credentials, or PII beyond what's strictly needed for routing.**

Tables (most already exist):
- `piggyback_provisions` — one row per hosted user. Stores `user_id`, `subdomain_short_id`, `subdomain_vanity`, `vercel_project_id`, `supabase_project_ref`, `state` (NEW/PROVISIONING/READY/CANCELLED/etc.), `stripe_customer_id`, `stripe_subscription_id`. Crucially also stores the user's Supabase **OAuth refresh token** (encrypted, used only by orchestrator-side jobs to apply migrations + run reconciliation; NOT used to access transaction data on demand).
- `provision_oauth_tokens` — encrypted Supabase + Vercel refresh tokens, separated for rotation.
- `provision_audit` — immutable audit log of state-machine transitions.
- `provision_health_checks` — last-checked timestamps + consecutive-failure counts.
- `subdomain_aliases` — vanity-rename 301 redirect window.
- `partner_links` (NEW) — see Identity spec. Pairs of `provision_id`s that share a 2Up partnership.
- `partner_claim_invitations` (NEW) — manual partner stub → real-partner-claim flow.
- `cancellation_feedback` — Stripe Customer Portal cancellation reasons.
- `funnel_events` — Phase 4 instrumentation, server-side mirror of PostHog events.

The orchestrator DB has its own auth.users (login at `piggyback.finance`). User signs in here, the orchestrator looks up their `provision_id`, redirects them to `{shortid}.piggyback.finance`. The tenant Supabase has its own auth.users with the same email — provisioning copies the auth identity over.

### What never lives in the orchestrator

- **The Up Bank PAT** — only in the user's tenant Supabase (encrypted with `UP_API_ENCRYPTION_KEY` env var on their Vercel project)
- **Any transaction data** — categories of spend, merchant names, dollar amounts, dates
- **The user's Supabase service role key** post-provision — only the OAuth refresh token (which can request a fresh service-role-equivalent on demand for migrations, but expires)

This is what makes the marketing pitch ("your data, your infra, your keys") true.

## How 2Up partnerships work in this model

The full design lives in the Identity spec (#2). Here's the data-level summary.

**The shared resource is the Up Bank joint account, not data in our system.** Both partners' Up PATs see the same joint account; both webhooks ingest the same transactions independently. Each partner's Supabase ends up with its own copy.

**The orchestrator stores ONLY the link.** A row in `partner_links` says: "provision A and provision B are partners, started 2026-05-12, both confirmed". No transaction data, no joint-account ID, no balances.

**Partner-aware features are computed at request time.** When Ben's app needs to show "Sarah paid 35% this month" on the AI Split card, it calls a thin orchestrator endpoint:
```
POST /api/partner-fanout
  → orchestrator looks up partner_link
  → fetches Sarah's monthly income/spend totals from her tenant Supabase via her stored OAuth token
  → returns aggregates only (totals, percentages — no transaction-level data)
  → response is NOT cached on the orchestrator
```

The orchestrator is a **fan-out router**, not a join. It never holds the merged data; the user's app receives both halves and merges in-memory for display.

**Categorization conflicts are local.** Ben categorizes a joint txn as "Groceries" → his DB only. Sarah categorizes the same txn (by `up_transaction_id`) as "Other" → her DB only. Each partner sees their own categorization. We could add cross-partner sync later as an opt-in feature, but MVP is independent views.

**Partner removal**: when Sarah deletes her account or leaves the partnership, the link in the orchestrator is severed. Both DBs keep their own data; nothing cascades. Ben's "Sarah" disappears from his AI Split card. Sarah's data lives on in her own Supabase (or she can delete it herself per Phase 3.9).

## State diagram — partnership lifecycle

```
Ben provisions:
  Ben's tenant: profiles(Ben), partnerships('My Budget'), partnership_members(Ben, owner)
  Orchestrator:  piggyback_provisions(Ben), no partner_link

Ben adds manual partner Sarah (no email match):
  Ben's tenant: partnerships.manual_partner_name='Sarah', manual_partner_dob=...
  Orchestrator:  no partner_link (manual partner is local-only)

Ben adds Sarah by email (sarah@example.com):
  Orchestrator:  partner_claim_invitations row created with token
  Email sent to sarah@example.com inviting her to join
  Ben's tenant: partnerships.manual_partner_name='Sarah' (still local stub until claim)

Sarah signs up at piggyback.finance with sarah@example.com:
  Orchestrator:  detects pending invitation, prompts "claim Ben's invite?"
  Sarah accepts → orchestrator provisions Sarah's tenant Supabase
  Sarah's tenant: profiles(Sarah), partnerships(also 'My Budget' or her own naming),
                  partnership_members(Sarah, owner)
  Orchestrator:  partner_claim_invitations.claimed_at = now()
                 partner_links row created: (ben_provision, sarah_provision, status='active')
  Ben's app:     manual_partner_name now resolves to Sarah's real profile via fan-out

Sarah leaves the partnership:
  Orchestrator:  partner_links.status = 'severed', severed_at = now()
  Both tenants:  retain own data, partner-aware UI degrades to solo view
```

## Migration path from current state

The current dev DB (`kbdmwkhpzrkivzjzlzzr`) has all users in one Supabase. The migration is:

1. Stand up the orchestrator's own Supabase project (`trwmouxmrlwasxxdlntq` is currently the public-facing prod orchestrator; we'll continue using it).
2. For each existing user with data in `kbdmwkhpzrkivzjzlzzr`, run a one-off provision job: create a fresh per-user Supabase, apply migrations, dump-and-restore the user's data filtered by `user_id` and `partnership_id`, store the new project ref in orchestrator's `piggyback_provisions`.
3. Update Vercel project env vars per user to point at their new Supabase.
4. Verify health, redirect their subdomain.
5. Once all migrated, archive the dev DB → repurpose as orchestrator's own tenant for testing.

For new users (post-launch): the existing `provisioner/state-machine.ts` flow already does this — it creates a Supabase project, runs migrations, creates a Vercel project, sets envs. We just have to make sure that flow runs on every signup (currently the OSS prototype skips it).

## Risks + open questions

1. **Cost**: Supabase free tier limits (500 MB DB, 2 GB egress, 7-day point-in-time recovery). At Pro pricing ($25/mo per project), 50 paying users = $1250/mo. Hosted tier at $19/mo means we're net negative until users churn off the free tier OR we negotiate Supabase team pricing. **Decision: launch on free tier, monitor; add a "your Supabase usage is approaching limits — upgrade?" surface in the app at 80% of free quotas.**

2. **OAuth token rotation**: Supabase OAuth refresh tokens have ~30-day TTL by default. Orchestrator needs a daily cron to refresh tokens before they expire. Failure to refresh = orchestrator locked out of that user's project (only thing affected: migrations + reconciliation, not user-facing reads).

3. **Vercel project per user limit**: Pro tier is 100 projects/team. After 100 users we need a Pro Plus team or have Vercel raise the cap. **Decision: monitor; raise via support at 80 users.**

4. **Migration latency**: provisioning a fresh Supabase + Vercel + applying migrations takes ~90s. The user sees a "Setting up your account…" loading screen for that duration. **Decision: pre-provision a small pool of "warm" Supabase projects so signup feels instant; assign one to the user and immediately start refilling the pool.** Out of scope for MVP — we'll do straightforward sequential provisioning and accept the 90s wait.

5. **Cross-partner data exposure**: the fan-out endpoint exposes Sarah's aggregate totals to Ben's app. We must enforce that Sarah CONSENTED to this when accepting the partner invite. The consent is granular: "Ben can see your aggregate income & expense totals; Ben CANNOT see individual transactions." We default to aggregate-only; per-transaction sharing is an opt-in toggle later.

## Acceptance criteria

The data-architecture work is "done" when:
- [ ] A new signup at `piggyback.finance` provisions a fresh Supabase project, applies all migrations, creates a Vercel project, sets env vars, attaches subdomain, and redirects user to `{shortid}.piggyback.finance/onboarding` — fully automated.
- [ ] The orchestrator has zero transaction data — `git grep` for `from("transactions")` in orchestrator-only routes returns nothing.
- [ ] Existing dev DB users have been migrated to per-user Supabase, with a verified-equivalent count of accounts/transactions in the new home.
- [ ] Two test partners can complete a 2Up flow end-to-end: invite → claim → see partner aggregates on `/home`.
- [ ] Documentation updated: `docs/architecture.md` describes the model, `docs/disaster-recovery.md` covers per-user backup procedures.

## Out of scope (deferred to later specs)

- The orchestrator-side state machine for provisioning ↔ this is spec #5
- The partner-claim flow specifics ↔ spec #2
- Sync resilience inside each user's tenant ↔ spec #4
- Onboarding wizard hydration ↔ spec #3

## Test strategy

- Unit: data-shape contracts. The orchestrator endpoint that returns partner aggregates has a typed schema; tests assert never-leaks-transaction-fields.
- Integration: the provisioning flow runs in isolation with a sandboxed Supabase Mgmt token. End state asserts schema parity.
- E2E: a Playwright test (or scripted) signs up two users with the same paired email, runs the partner claim, verifies fan-out returns expected aggregates.
- Migration: a dry-run mode of the user-data migration that diffs source vs. target and reports any mismatch before committing.
