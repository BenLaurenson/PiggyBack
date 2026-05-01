# Identity & Partner Claims — Design Spec

> **Sub-spec 2 of 5.** Builds on Data Architecture (#1).
> Status: drafted 2026-05-01.
> Implementation plan: `2026-05-01-02-identity-and-partner-claims-plan.md`.

## What this spec answers

- How do two real users become 2Up partners?
- What's a manual partner, when do you use one, how does the upgrade-to-real flow work?
- What are the partner consent boundaries (who can see what)?
- How do partnership disputes and removals work?
- How does authentication work across orchestrator + per-user tenant Supabases?

## The three partnership states

Every user is always in exactly one of these states:

```
SOLO                   →  no partner, just yourself
WITH_MANUAL_PARTNER    →  you have a partner record but they don't have an account
                          (you fill in their name, income, etc. yourself; useful for
                          singles who want partner-aware budgeting hypothetically OR
                          users whose partner doesn't want a PiggyBack account)
WITH_REAL_PARTNER      →  both you and your partner have provisioned accounts +
                          a confirmed link in the orchestrator's partner_links table
```

Transitions:
- `SOLO → WITH_MANUAL_PARTNER`: user adds a manual partner stub from `/settings/partner`.
- `SOLO → WITH_REAL_PARTNER`: user invites by email → invitee accepts.
- `WITH_MANUAL_PARTNER → WITH_REAL_PARTNER`: user invites the manual partner by email → invitee accepts. Manual stub is replaced by the real partner reference.
- `WITH_REAL_PARTNER → SOLO`: either party leaves the partnership.
- `WITH_REAL_PARTNER → WITH_MANUAL_PARTNER`: not allowed. If the real partner leaves, the data they contributed (in their own DB) is gone from the user's view; falling back to a manual stub would lose context. User starts fresh as SOLO.

## Authentication model

Two layers:

1. **Orchestrator auth** — `piggyback.finance` Supabase. User signs in here with Google or email/password. Their orchestrator-side `auth.users` row is the canonical identity.

2. **Tenant auth** — `{shortid}.piggyback.finance` runs a Next.js app talking to *the user's own Supabase project*. That project also has its own `auth.users`. Provisioning copies the orchestrator-side identity over: same email, same `id` UUID where possible (Supabase admin API allows this).

Sign-in flow:
- User navigates to `piggyback.finance` (or directly `{shortid}.piggyback.finance`)
- If they hit `piggyback.finance`, orchestrator authenticates them, looks up their `provision_id`, redirects to `{shortid}.piggyback.finance/auth/handoff?token=…`
- The `/auth/handoff` route on the tenant app validates the token (signed by orchestrator), creates a tenant Supabase session, redirects to `/home`
- Tokens are short-lived (60s), single-use, signed with `HS256` using a shared secret stored in both orchestrator and tenant env vars

This lets us have a single sign-in surface (`piggyback.finance`) without giving the orchestrator any access to user data.

## Manual partner data model (in user's tenant Supabase)

Already exists; this spec just formalizes:

```
partnerships table:
  id uuid PK
  name text  -- 'My Budget' or user-customized
  manual_partner_name text       -- "Sarah" — populated when user adds manual partner
  manual_partner_dob date
  manual_partner_target_retirement_age int
  manual_partner_super_balance_cents bigint
  manual_partner_super_contribution_rate text
  manual_partner_email text       -- NEW: email if known. NULL for fully-manual.
  manual_partner_invited_at timestamptz  -- NEW: when invitation was sent
  manual_partner_claim_token uuid -- NEW: token to upgrade-to-real (kept on orchestrator too)

partnership_members table:
  partnership_id uuid FK
  user_id uuid FK auth.users(id)  -- the OWNER's user_id (always = the tenant's only user
                                  -- pre-claim). After claim, the partner's tenant has
                                  -- its OWN partnership_members with their user_id.
  role text  -- 'owner' | 'partner'
  joined_at timestamptz
  -- NEW columns:
  is_remote_mirror boolean DEFAULT false
                                  -- true means this row mirrors a partner who lives in
                                  -- a different tenant Supabase. The actual data lives
                                  -- in their tenant; this row exists for FK integrity
                                  -- so partnership_id-scoped queries work.
  remote_provision_id uuid        -- when is_remote_mirror=true, points to orchestrator
                                  -- piggyback_provisions.id for fan-out lookups.
```

**Crucial rule**: each tenant Supabase has at most ONE non-mirror `partnership_members` row (the tenant's own user). All other rows for the same partnership are `is_remote_mirror=true`.

## Orchestrator data model

```
partner_links (NEW):
  id uuid PK
  initiator_provision_id uuid FK piggyback_provisions(id) ON DELETE CASCADE
  acceptor_provision_id uuid FK piggyback_provisions(id) ON DELETE CASCADE
  status text  -- 'pending' | 'active' | 'severed' | 'rejected'
  initiated_at timestamptz NOT NULL DEFAULT now()
  active_at timestamptz       -- when status flipped to 'active'
  severed_at timestamptz      -- when status flipped to 'severed'
  severed_by_provision_id uuid -- which side initiated the sever
  consent_aggregate_view boolean NOT NULL DEFAULT true
                              -- aggregate income/expense totals visible to partner
  consent_transaction_view boolean NOT NULL DEFAULT false
                              -- per-transaction details visible to partner. Off by default.
  CHECK (initiator_provision_id != acceptor_provision_id)
  UNIQUE NULLS NOT DISTINCT (LEAST(initiator_provision_id, acceptor_provision_id),
                              GREATEST(initiator_provision_id, acceptor_provision_id))
                              -- only one link per pair, regardless of who initiated

partner_claim_invitations (NEW):
  id uuid PK
  invitee_email text NOT NULL
  invited_by_provision_id uuid FK piggyback_provisions(id) ON DELETE CASCADE
  invited_by_partnership_id uuid    -- the partnership in the inviter's tenant DB
                                    -- (we need this to know which partnership to mirror
                                    -- into the acceptor's tenant when they accept)
  manual_partner_name text          -- the name the inviter assigned; we offer it as a
                                    -- pre-fill suggestion to the invitee
  token uuid NOT NULL UNIQUE        -- the link sent in the invitation email
  expires_at timestamptz NOT NULL   -- 7 days
  claimed_at timestamptz            -- when invitee accepted; null = pending
  claimed_provision_id uuid FK piggyback_provisions(id)
  rejected_at timestamptz           -- when invitee rejected; mutually exclusive with claimed_at
  CHECK (claimed_at IS NULL OR rejected_at IS NULL)
```

## Partner invitation + claim flow

### Inviter side — Ben's app

1. Ben goes to `/settings/partner`.
2. Picks "Invite partner by email" → enters `sarah@example.com`, optionally a name "Sarah".
3. Server action calls `POST piggyback.finance/api/partners/invite` with Ben's tenant's session token + the invitee email.
4. Orchestrator:
   - Validates Ben's session via the orchestrator-tenant handoff key.
   - Resolves Ben's `provision_id` from his orchestrator user.
   - Looks up `inviter_partnership_id` by calling Ben's tenant for the partnership Ben owns (Ben's app passes it in the request).
   - Creates `partner_claim_invitations` row with token + 7-day expiry.
   - Sends email via Resend: "Ben invited you to share his PiggyBack budget" → link to `piggyback.finance/claim/{token}`.
5. Ben's app updates `partnerships.manual_partner_email` + `manual_partner_invited_at` so he sees "Pending — invite sent" in the UI.

### Invitee side — Sarah accepts

Sarah clicks the email link → lands on `piggyback.finance/claim/{token}`.

**Case A: Sarah has no PiggyBack account yet**
- Page shows "Ben invited you to share his budget. Sign up to accept."
- Sarah signs up via Google or email/password (orchestrator-side auth).
- After signup, before redirecting to onboarding, the claim handler fires:
  - Creates orchestrator-side `piggyback_provisions` row for Sarah.
  - Provisions Sarah's tenant Supabase (per spec #5).
  - Creates `partner_links` row with `status='active'`.
  - Marks invitation `claimed_at = now()`, `claimed_provision_id = sarah's_provision`.
  - Triggers cross-tenant mirroring: in BOTH tenants, ensures a `partnership_members` row references the partner via `is_remote_mirror=true, remote_provision_id=…`.
- Sarah is redirected to her own `{shortid}.piggyback.finance/onboarding` to enter her own Up Bank PAT.

**Case B: Sarah already has a PiggyBack account**
- Page shows "Ben invited you. Accept and link to Ben's budget?"
- Sarah signs in (orchestrator-side auth) → claim handler fires:
  - Creates `partner_links` row.
  - Mirror rows in both tenants.
  - Marks invitation claimed.
- Sarah redirects to her existing `{shortid}.piggyback.finance/home`. Her existing data is unchanged; she now sees Ben's aggregates in the partner card.

**Case C: Sarah rejects**
- Sarah clicks "Decline" on the claim page.
- Invitation row gets `rejected_at = now()`.
- Ben's app reverts to manual partner state (or removes the partner entirely if the user prefers).

### Cancel an outstanding invitation

Inviter goes to `/settings/partner` → "Cancel invitation" → orchestrator deletes the `partner_claim_invitations` row and the email link 404s if they click it later.

### Token security

- 7-day expiry. After 7 days the link returns "this invitation expired".
- Single-use. After `claimed_at` or `rejected_at`, link returns "this invitation has been used".
- 256-bit UUID v4. Tokens are not reversible; we look them up by exact match.
- Email-bound: the email field on the `auth.users` row at signup must EQUAL `invitee_email`. Otherwise the claim is rejected ("this invitation was sent to sarah@example.com — sign in with that email to accept").

## Consent model

Two granular consent toggles, both on `partner_links`:

| Toggle | Default | What it allows |
|---|---|---|
| `consent_aggregate_view` | `true` | Partner sees your monthly income/expense totals, % of joint spend you covered |
| `consent_transaction_view` | `false` | Partner sees individual transaction descriptions/amounts/categories |

Toggles are bilateral — each partner sets them for what THEIR data is willing to expose. So Ben might toggle `consent_aggregate_view=true` (Sarah can see Ben's totals) but `consent_transaction_view=false` (Sarah cannot see Ben's individual txns). Independently, Sarah might set both to true. Each partner's view of the OTHER respects the OTHER's settings.

Toggles can be flipped from `/settings/partner` at any time. Flipping `consent_aggregate_view=false` immediately stops the fan-out endpoint from returning your data to your partner's app — they'll see "Partner has hidden their data".

## Partner removal flow

Either partner can sever the link from `/settings/partner` → "Remove partner".

Modal: "Removing Sarah will:
- Stop showing her income & expense data on your home screen
- Stop showing your data on hers
- Both of you keep your own transaction history
- Re-inviting later starts fresh — old splits and shared categorizations don't restore
"

User confirms → orchestrator updates `partner_links.status = 'severed'`. Both tenants get notified via webhook (orchestrator pings both tenant apps' `/api/webhooks/partner-severed`); each tenant removes the `is_remote_mirror=true` `partnership_members` row.

If the severance was mutual (both partners hit Remove within a 24h window), no further action. If one-sided, the OTHER partner gets a notification ("Sarah removed you from your shared partnership") and a "Re-invite" button.

## Joint account handling

Joint accounts are owned by both partners' Up Bank logins. So:
- Ben's Up PAT can fetch the joint account → his webhook ingests joint transactions
- Sarah's Up PAT can fetch the same joint account → her webhook ingests the same transactions
- Each transaction has the same `up_transaction_id` in both tenants

We do NOT try to dedupe across tenants — each tenant has its own copy and treats it independently. The split-engine logic in each tenant computes "Ben's share" from Ben's perspective; "Sarah's share" computed identically from her perspective should match (deterministic split rules), but if they differ (e.g., custom override on Ben's side that Sarah doesn't have), each app shows that user's own version.

For partner-aware reporting (the AI Split card), we lean on the fan-out endpoint: Ben's app asks for Sarah's totals; Sarah's app independently asks for Ben's. The numbers come from the partner's perspective, which by deterministic split is the same as the local perspective. If overrides diverge, the displayed number is "what your partner thinks the split was" — interesting transparency feature, surface the diff.

## Edge cases

| Edge | Resolution |
|---|---|
| Inviter's email gets changed to match invitee email | Email match is determined at claim time, not invite time. Re-validate at claim. |
| Invitee tries to claim two different invitations | Only one active partnership per user. Trying to claim a second invitation while in `WITH_REAL_PARTNER` state → "You're already in a partnership. Leave first to accept this invite." |
| Inviter deletes account before invitee claims | `piggyback_provisions ON DELETE CASCADE` → invitation auto-cleared. Email link 404s. |
| Both partners delete account simultaneously | Each side's data is gone from their own DB. Orchestrator's `partner_links` row references CASCADEd, so the link is gone too. Clean. |
| Invitee already has a partnership | Surface error: "You're already partnered with X. Leave that partnership first." |
| Inviter changes email post-invite | Invitation's `invited_by_provision_id` still resolves to the inviter's provision. Email change doesn't invalidate. |
| Invitee changes email post-signup, then claims | Email match is enforced at claim time. If email no longer matches `invitee_email`, claim is rejected. They can ask the inviter to re-send. |
| Manual partner had data filled in before upgrade | On upgrade-to-real, `manual_partner_*` fields stay populated locally as-is for historical context. The UI starts showing the real partner's data alongside the manual record. We DON'T overwrite manual fields with real partner data — the user explicitly entered those values. |
| Real partner's tenant Supabase is down | Fan-out endpoint returns 503 with a "Partner data temporarily unavailable" payload. UI degrades to local-only view with a yellow banner. |

## Risks + open questions

1. **Email enumeration**: someone could spam `POST /api/partners/invite` with random emails to discover valid PiggyBack users. **Mitigation**: rate-limit per inviter (5 invitations / hour). Don't surface "user X exists" — invitation flow doesn't differentiate between "user exists" and "user doesn't exist" — just sends the email.

2. **Stale fan-out data**: if the orchestrator endpoint caches partner data for performance, partners might see outdated info. **Decision**: no orchestrator-side caching of partner data. Always fan-out fresh. Performance hit is acceptable for the privacy guarantee. Each tenant can client-side cache for the page lifecycle.

3. **Claim token leakage**: anyone with the email link can claim. If the inviter sends to the wrong email, attacker could claim. **Mitigation**: email-bound enforcement at claim time. The token alone doesn't grant access — the signup email must match.

4. **Partnership orphans**: if Ben's tenant Supabase is deleted directly via Supabase dashboard (not via orchestrator's deleteAccount path), orchestrator still has stale `provisions` + `partner_links` rows. **Mitigation**: health-check cron detects unreachable tenants → if 3 consecutive checks fail, mark provision as "abandoned", auto-sever any active partner_links, email the partner.

## Test strategy

- Unit: `partner_links` constraints (CHECK, UNIQUE), invitation expiry math, email validation regex.
- Integration: full claim flow with two test orchestrator users + two test tenants. Stub email sending. Verify the resulting `partner_links` row + bilateral `is_remote_mirror` rows.
- E2E: Playwright that signs up Ben → invites Sarah → signs up Sarah on a fresh browser → accepts the invite → verifies Ben's `/home` shows Sarah's aggregates.
- Property tests: invariant that any pair of provisions has at most one `partner_links` row.
- Permission tests: fan-out endpoint with `consent_aggregate_view=false` returns 403 / hidden-state response.
