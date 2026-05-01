# PiggyBack Architecture

Two-role system: **orchestrator** + **tenant**. The same Next.js codebase runs
in both roles; the only difference is the `NEXT_PUBLIC_HOSTED_ENABLED` env var.

See `docs/superpowers/specs/2026-05-01-01-data-architecture-design.md` for the
full design.

## Orchestrator (`piggyback.finance`)

Holds metadata for every hosted user: provisions, partner links, claim
invitations, audit logs, billing IDs. **Never** holds transactions, accounts,
balances, categories, or any of the user's actual financial data. **Never**
holds the user's Up Bank PAT.

Lives at `piggyback.finance` (and `dev.piggyback.finance` per env). Single
Vercel project + single Supabase project. Recognised in code by
`NEXT_PUBLIC_HOSTED_ENABLED=true`. Use `isOrchestrator()`, `isTenant()`,
`assertOrchestrator()`, `assertTenant()` from `@/lib/role-context` for
runtime checks.

### Orchestrator-only tables

- `piggyback_provisions` — one row per hosted user. Tracks subdomain,
  Vercel project, Supabase project, billing IDs, state machine.
- `provision_oauth_tokens` — encrypted Supabase + Vercel refresh tokens.
- `provision_audit` — immutable audit log of state-machine transitions.
- `provision_health_checks` — last-checked timestamps + failure counts.
- `subdomain_aliases` — vanity-rename 301 redirect window.
- `partner_links` — pairs of provisions sharing a 2Up partnership.
- `partner_claim_invitations` — pending partner-claim invitations.
- `cancellation_feedback` — Stripe Customer Portal cancellation reasons.
- `funnel_events` — server-side mirror of PostHog Phase 4 events.

ESLint enforces orchestrator-only paths (`src/app/api/admin/**`,
`src/lib/orchestrator-*.ts`, `src/lib/provisioner/**`) cannot read or write
tenant tables — see the `no-restricted-syntax` rule in `eslint.config.mjs`.

## Tenant (`{shortid}.piggyback.finance`)

One per user. Holds the user's full financial dataset. The Up Bank PAT lives
encrypted in this user's Supabase, decrypted only at request time inside the
user's own Vercel function (encryption key is on the user's Vercel project
env, not the orchestrator's).

Same Next.js codebase as the orchestrator — but `NEXT_PUBLIC_HOSTED_ENABLED`
is unset, gating the orchestrator-only routes off.

### Tenant tables

The complete `public.*` schema from `supabase/migrations/`. Highlights:

- `accounts`, `transactions`, plus all transaction overlay tables
- `partnerships` + `partnership_members` (max 2 rows per partnership; user's
  own row + manual stub OR a real partner whose membership is mirrored from
  the orchestrator's `partner_links`)
- `categories`, `category_mappings`, `merchant_category_rules`,
  `merchant_default_rules` (seeded on provision)
- `couple_split_*`, `expense_*`, `budgets`, `savings_goals`, etc.
- `up_api_configs` — stores the user's encrypted Up PAT (never leaves their
  Supabase)
- `profiles` — the user's own profile row
- `partner_link_requests` — incoming claim invitations from the orchestrator

## Why?

Up Bank's API terms forbid third parties from holding customer credentials.
Per-user infra means we hold no creds, users keep their data on cancellation,
and the marketing pitch ("your data, your infra, your keys") is true.

## Cross-tenant communication

When the orchestrator needs partner aggregates (e.g. for the AI Split card),
it uses the partner's stored Supabase OAuth refresh token to fan out a
request to that tenant. Returns aggregate totals only — never
transaction-level data. The orchestrator is a fan-out router, not a join;
the user's app receives both halves and merges in-memory for display.

Consent is granular and stored on `partner_links`:
`consent_aggregate_view` (default `true`) and `consent_transaction_view`
(default `false`).

## Migration path from current state

The dev DB (`kbdmwkhpzrkivzjzlzzr`) currently mixes orchestrator metadata
and tenant data — a legacy of the OSS prototype. The migration is:

1. Stand up the orchestrator's own Supabase project (today this is the
   public-facing prod orchestrator at `trwmouxmrlwasxxdlntq`).
2. For each existing user with data in the dev DB, run a one-off provision
   job: create a fresh per-user Supabase, apply migrations, dump-and-restore
   the user's data filtered by `user_id` and `partnership_id`, store the new
   project ref in `piggyback_provisions`.
3. Update Vercel project env vars per user to point at their new Supabase.
4. Verify health, redirect their subdomain.
5. Once all migrated, archive the dev DB or repurpose as orchestrator's own
   tenant for testing.

For new signups post-launch, the existing `provisioner/state-machine.ts`
flow already does this end-to-end.

## Related specs

- `docs/superpowers/specs/2026-05-01-01-data-architecture-design.md` —
  this document's source of truth
- `docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md` —
  partner claim flow
- `docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md`
- `docs/superpowers/specs/2026-05-01-04-sync-state-machine-design.md`
- `docs/superpowers/specs/2026-05-01-05-multi-tenant-provisioning-design.md`
