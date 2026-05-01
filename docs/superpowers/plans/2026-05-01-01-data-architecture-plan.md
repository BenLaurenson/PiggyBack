# Data Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the codebase into the per-user-Supabase + metadata-only-orchestrator architecture from spec #1, including the schema, the helpers, the lint that prevents transaction data ever entering the orchestrator, and the migration pathway for existing dev users.

**Architecture:** Two roles — **orchestrator** (piggyback.finance) holds only provisions, partner links, billing metadata. **Tenant** holds the user's whole financial dataset. Code distinguishes the two via a `NEXT_PUBLIC_HOSTED_ENABLED=true` env on orchestrator deploys; helpers fail-closed if a tenant-only or orchestrator-only operation runs in the wrong context.

**Tech Stack:** Supabase (Postgres + Mgmt API + OAuth), Vercel API, Next.js, TypeScript.

---

## Spec reference

`docs/superpowers/specs/2026-05-01-01-data-architecture-design.md`. Read this in full before starting.

---

## File structure

**Existing files to modify:**
- `src/lib/env.ts` — add typed accessors for hosted-mode env vars
- `src/lib/provisioner/state-machine.ts` — already exists, will be extended
- `supabase/migrations/` — new migration files for orchestrator-only tables

**New files to create:**
- `src/lib/role-context.ts` — runtime check for orchestrator vs tenant role
- `src/lib/orchestrator-client.ts` — narrow client for orchestrator DB (used only on `piggyback.finance` deploy)
- `src/lib/__tests__/role-context.test.ts`
- `supabase/migrations/20260501000001_orchestrator_partner_links.sql`
- `supabase/migrations/20260501000002_orchestrator_partner_claim_invitations.sql`
- `docs/architecture.md` — narrative description for future contributors
- `eslint.config.mjs` — add custom rule that flags `from("transactions")` in orchestrator-only paths

---

## Task 1: Role-context helper

**Files:**
- Create: `src/lib/role-context.ts`
- Test: `src/lib/__tests__/role-context.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/__tests__/role-context.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { isOrchestrator, isTenant, assertOrchestrator, assertTenant } from "@/lib/role-context";

describe("role-context", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("isOrchestrator true when NEXT_PUBLIC_HOSTED_ENABLED=true", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
    expect(isOrchestrator()).toBe(true);
    expect(isTenant()).toBe(false);
  });

  it("isTenant true when NEXT_PUBLIC_HOSTED_ENABLED unset", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "");
    expect(isOrchestrator()).toBe(false);
    expect(isTenant()).toBe(true);
  });

  it("assertOrchestrator throws on tenant", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "");
    expect(() => assertOrchestrator()).toThrow(/orchestrator-only/i);
  });

  it("assertTenant throws on orchestrator", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
    expect(() => assertTenant()).toThrow(/tenant-only/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/lib/__tests__/role-context.test.ts`. Expected: file-not-found error.

- [ ] **Step 3: Implement**

```ts
// src/lib/role-context.ts
/**
 * Runtime check distinguishing orchestrator (piggyback.finance) from tenant
 * ({shortid}.piggyback.finance) deploys. Orchestrator never holds transaction
 * data; tenant never holds Stripe / cross-user OAuth tokens.
 *
 * The signal is `NEXT_PUBLIC_HOSTED_ENABLED=true`, set on the orchestrator
 * Vercel project only. Per spec #1 (data architecture).
 */
export function isOrchestrator(): boolean {
  return process.env.NEXT_PUBLIC_HOSTED_ENABLED === "true";
}

export function isTenant(): boolean {
  return !isOrchestrator();
}

export function assertOrchestrator(label = "this code path"): void {
  if (!isOrchestrator()) {
    throw new Error(
      `${label} is orchestrator-only but NEXT_PUBLIC_HOSTED_ENABLED is not 'true'. Refusing to run on a tenant deploy.`
    );
  }
}

export function assertTenant(label = "this code path"): void {
  if (!isTenant()) {
    throw new Error(
      `${label} is tenant-only but NEXT_PUBLIC_HOSTED_ENABLED='true'. Refusing to run on the orchestrator.`
    );
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/lib/__tests__/role-context.test.ts`. Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/role-context.ts src/lib/__tests__/role-context.test.ts
git commit -m "feat(role): orchestrator vs tenant runtime role helpers + assertions"
```

---

## Task 2: Migration — orchestrator partner_links table

**Files:**
- Create: `supabase/migrations/20260501000001_orchestrator_partner_links.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260501000001_orchestrator_partner_links.sql
-- Spec: docs/superpowers/specs/2026-05-01-01-data-architecture-design.md
-- + docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
--
-- Pairs of provisions that share a 2Up partnership. Lives ONLY on the
-- orchestrator DB. Never apply to tenant Supabases — there's no
-- piggyback_provisions there to FK against.

CREATE TABLE IF NOT EXISTS public.partner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_provision_id uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  acceptor_provision_id  uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','active','severed','rejected')),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  active_at timestamptz,
  severed_at timestamptz,
  severed_by_provision_id uuid REFERENCES public.piggyback_provisions(id) ON DELETE SET NULL,
  consent_aggregate_view boolean NOT NULL DEFAULT true,
  consent_transaction_view boolean NOT NULL DEFAULT false,
  CHECK (initiator_provision_id <> acceptor_provision_id)
);

-- Only one active or pending link per pair, regardless of who initiated.
CREATE UNIQUE INDEX partner_links_unique_pair
  ON public.partner_links (
    LEAST(initiator_provision_id, acceptor_provision_id),
    GREATEST(initiator_provision_id, acceptor_provision_id)
  )
  WHERE status IN ('pending', 'active');

CREATE INDEX partner_links_initiator_idx ON public.partner_links(initiator_provision_id);
CREATE INDEX partner_links_acceptor_idx  ON public.partner_links(acceptor_provision_id);

ALTER TABLE public.partner_links ENABLE ROW LEVEL SECURITY;

-- Reads: a user can see partner_links rows that mention either side they own
-- via piggyback_provisions.user_id = auth.uid().
CREATE POLICY "Users can read their own partner_links" ON public.partner_links
  FOR SELECT TO authenticated
  USING (
    initiator_provision_id IN (
      SELECT id FROM public.piggyback_provisions WHERE user_id = auth.uid()
    )
    OR acceptor_provision_id IN (
      SELECT id FROM public.piggyback_provisions WHERE user_id = auth.uid()
    )
  );

-- Writes: only via service-role (the orchestrator's claim handler).
GRANT SELECT ON public.partner_links TO authenticated;
GRANT ALL ON public.partner_links TO service_role;
REVOKE ALL ON public.partner_links FROM anon;

COMMENT ON TABLE public.partner_links IS
  'Pairs of provisions sharing a 2Up partnership. Orchestrator-only — do NOT apply to tenant Supabases.';
```

- [ ] **Step 2: Apply to dev orchestrator (will move to prod after merge)**

The orchestrator DB IS the prod-facing DB at `trwmouxmrlwasxxdlntq` (per MASTER_TODO line 63: "PiggyBack Demo = prod"). For now keep migrations dev-only via `mcp__supabase__apply_migration` against dev-orchestrator (`kbdmwkhpzrkivzjzlzzr` doubles as orchestrator dev), since prod is live. After CI green, apply to prod.

Run via Supabase MCP tool:
```
mcp__supabase__apply_migration({
  project_id: "kbdmwkhpzrkivzjzlzzr",
  name: "orchestrator_partner_links",
  query: <SQL above>
})
```

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM public.partner_links;  -- should be 0
SELECT polname FROM pg_policy WHERE polrelid='public.partner_links'::regclass;
```

- [ ] **Step 4: Commit migration**

```bash
git add supabase/migrations/20260501000001_orchestrator_partner_links.sql
git commit -m "feat(db): orchestrator partner_links table (spec #1, #2)"
```

---

## Task 3: Migration — orchestrator partner_claim_invitations table

**Files:**
- Create: `supabase/migrations/20260501000002_orchestrator_partner_claim_invitations.sql`

- [ ] **Step 1: Write migration**

```sql
-- 20260501000002_orchestrator_partner_claim_invitations.sql
-- Spec: spec #2 (identity + partner claims)

CREATE TABLE IF NOT EXISTS public.partner_claim_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitee_email text NOT NULL CHECK (invitee_email ~ '^[^@]+@[^@]+\.[^@]+$'),
  invited_by_provision_id uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  invited_by_partnership_id uuid NOT NULL,
  manual_partner_name text,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  claimed_at timestamptz,
  claimed_provision_id uuid REFERENCES public.piggyback_provisions(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  CHECK (claimed_at IS NULL OR rejected_at IS NULL)
);

CREATE INDEX partner_claim_invitations_token_idx
  ON public.partner_claim_invitations(token)
  WHERE claimed_at IS NULL AND rejected_at IS NULL;

CREATE INDEX partner_claim_invitations_pending_by_email_idx
  ON public.partner_claim_invitations(lower(invitee_email))
  WHERE claimed_at IS NULL AND rejected_at IS NULL;

CREATE INDEX partner_claim_invitations_inviter_idx
  ON public.partner_claim_invitations(invited_by_provision_id);

ALTER TABLE public.partner_claim_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inviters can read their own invitations"
  ON public.partner_claim_invitations FOR SELECT TO authenticated
  USING (
    invited_by_provision_id IN (
      SELECT id FROM public.piggyback_provisions WHERE user_id = auth.uid()
    )
  );

GRANT SELECT ON public.partner_claim_invitations TO authenticated;
GRANT ALL ON public.partner_claim_invitations TO service_role;
REVOKE ALL ON public.partner_claim_invitations FROM anon;

COMMENT ON TABLE public.partner_claim_invitations IS
  'Pending partner-claim invitations. Orchestrator-only.';
```

- [ ] **Step 2: Apply via MCP**

Same pattern as Task 2.

- [ ] **Step 3: Verify policies + token uniqueness**

```sql
INSERT INTO partner_claim_invitations (invitee_email, invited_by_provision_id, invited_by_partnership_id)
VALUES ('test@example.com', '<some_provision_id>', '<some_partnership_id>')
RETURNING token;
-- Run twice with same data; token should differ each time
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260501000002_orchestrator_partner_claim_invitations.sql
git commit -m "feat(db): orchestrator partner_claim_invitations table (spec #2)"
```

---

## Task 4: ESLint rule preventing transaction data on orchestrator paths

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Add custom rule to flag tenant-table reads in orchestrator-only routes**

```js
// eslint.config.mjs (add to the rules block)
{
  files: ["src/app/api/admin/**", "src/lib/orchestrator-*.ts", "src/lib/provisioner/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.property.name='from'][arguments.0.value=/^(transactions|accounts|savings_goals|investments|goal_contributions|investment_contributions|expense_definitions|budgets|tags|tags_canonical|transaction_tags|merchant_category_rules|couple_split_settings)$/]",
        message: "Tenant-table reads/writes are forbidden in orchestrator-only paths. Per spec #1 — the orchestrator never holds transaction data. If you need partner aggregates, use the fan-out endpoint via stored OAuth refresh tokens.",
      },
    ],
  },
}
```

- [ ] **Step 2: Run lint to find existing violations**

Run: `npm run lint`. Expected: zero new errors (paths matched here haven't been written yet by the team).

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "lint(orchestrator): forbid tenant-table reads from orchestrator paths"
```

---

## Task 5: Architecture documentation

**Files:**
- Create: `docs/architecture.md`

- [ ] **Step 1: Write architecture overview**

```markdown
# PiggyBack Architecture

Two-role system: **orchestrator** + **tenant**.

## Orchestrator (`piggyback.finance`)

Holds metadata for every hosted user: provisions, partner links, claim invitations,
audit logs, billing IDs. NEVER holds transactions, accounts, balances, categories,
or any of the user's actual financial data. NEVER holds the user's Up Bank PAT.

Lives at `piggyback.finance` and `dev.piggyback.finance` (per env). Single Vercel
project + single Supabase project. Recognised in code by `NEXT_PUBLIC_HOSTED_ENABLED=true`.

## Tenant (`{shortid}.piggyback.finance`)

One per user. Holds the user's full financial dataset. The Up Bank PAT lives
encrypted in this user's Supabase, decrypted only at request time inside the
user's own Vercel function.

Same Next.js codebase as the orchestrator — but `NEXT_PUBLIC_HOSTED_ENABLED` is
unset, gating the orchestrator-only routes.

## Why?

Up Bank's API terms forbid third parties from holding customer credentials.
Per-user infra means we hold no creds → users keep their data on cancellation
→ marketing pitch is true.

## Cross-tenant communication

When the orchestrator needs to read partner aggregates (for the AI Split card,
for example), it uses the partner's stored Supabase OAuth refresh token to
fan-out a request to that tenant. Never returns transaction-level data; only
aggregate totals.

See specs/ for full design details.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: architecture overview (orchestrator vs tenant roles)"
```

---

## Self-review

- [ ] All 4 tasks have working tests where applicable
- [ ] No "TODO" or "fill in" placeholders
- [ ] Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` not needed since these are NEW tables)
- [ ] Lint rule path-list matches actual orchestrator-only paths in repo

## Acceptance criteria

- [ ] `partner_links` + `partner_claim_invitations` tables exist on dev and prod orchestrator with correct policies
- [ ] `npm run lint` reports zero errors after the rule added
- [ ] `role-context` tests pass (4 tests)
- [ ] `docs/architecture.md` committed
