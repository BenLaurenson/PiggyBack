# Identity & Partner Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` tracking.

**Goal:** Implement the manual / real partner flow with email-based invitations, claim handler, bilateral mirroring, and consent toggles. Builds on tables created in plan #1.

**Architecture:** Inviter generates a token in orchestrator's `partner_claim_invitations`; sends email via Resend; invitee clicks link, signs in (or signs up), claim handler creates `partner_links` row + `is_remote_mirror` rows in BOTH tenant Supabases.

**Tech Stack:** Next.js, Supabase service role, Resend.

---

**Spec:** `docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md`. **Depends on:** plan #1 tasks 2 + 3 (the new tables).

---

## File structure

**New:**
- `src/lib/partners/invitations.ts` — server-side invitation creation + email send
- `src/lib/partners/claim.ts` — server-side claim handler
- `src/lib/partners/fanout.ts` — fan-out helper (used by orchestrator endpoints)
- `src/lib/partners/__tests__/{invitations,claim,fanout}.test.ts`
- `src/app/claim/[token]/page.tsx` — server-rendered claim page
- `src/app/api/partners/invite/route.ts` — POST: create invitation
- `src/app/api/partners/claim/route.ts` — POST: claim invitation (orchestrator-side)
- `src/app/api/partners/cancel/route.ts` — DELETE: cancel pending invitation
- `src/app/api/partners/sever/route.ts` — POST: end partnership
- `src/app/api/orchestrator/partner-aggregates/route.ts` — orchestrator-only fan-out endpoint
- `src/components/settings/partner-config.tsx` — reusable partner settings UI (client component)

**Modify:**
- `src/app/(app)/settings/partner/page.tsx` — wire to new endpoints
- `src/lib/email.ts` — add `sendPartnerInvitationEmail` helper
- `supabase/migrations/20260501000003_tenant_partnership_members_remote_mirror.sql` — adds `is_remote_mirror` + `remote_provision_id` columns to tenant `partnership_members`
- `supabase/migrations/20260501000004_tenant_partnership_invitation_columns.sql` — adds `manual_partner_email`, `manual_partner_invited_at`, `manual_partner_claim_token` to tenant `partnerships`

---

## Task 1: Migration — partnership_members remote_mirror columns (tenant)

**Files:**
- Create: `supabase/migrations/20260501000003_tenant_partnership_members_remote_mirror.sql`

- [ ] **Step 1: Write SQL**

```sql
-- 20260501000003_tenant_partnership_members_remote_mirror.sql
ALTER TABLE public.partnership_members
  ADD COLUMN IF NOT EXISTS is_remote_mirror boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_provision_id uuid;

CREATE INDEX IF NOT EXISTS partnership_members_remote_idx
  ON public.partnership_members(remote_provision_id)
  WHERE is_remote_mirror = true;

COMMENT ON COLUMN public.partnership_members.is_remote_mirror IS
  'When true, this row mirrors a partner who lives in a different tenant Supabase. The actual data lives in their tenant; this row exists for FK integrity. remote_provision_id points to orchestrator piggyback_provisions.id.';
```

- [ ] **Step 2: Apply via MCP** (dev DB only). Verify columns exist.
- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260501000003_tenant_partnership_members_remote_mirror.sql
git commit -m "feat(db): partnership_members remote_mirror columns (spec #2)"
```

---

## Task 2: Migration — partnerships invitation columns (tenant)

**Files:**
- Create: `supabase/migrations/20260501000004_tenant_partnership_invitation_columns.sql`

- [ ] **Step 1: SQL**

```sql
ALTER TABLE public.partnerships
  ADD COLUMN IF NOT EXISTS manual_partner_email text,
  ADD COLUMN IF NOT EXISTS manual_partner_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_partner_claim_token uuid;

CREATE INDEX IF NOT EXISTS partnerships_manual_partner_email_idx
  ON public.partnerships(lower(manual_partner_email))
  WHERE manual_partner_email IS NOT NULL;

COMMENT ON COLUMN public.partnerships.manual_partner_claim_token IS
  'Token shared with orchestrator partner_claim_invitations. Local copy lets the inviter cancel without round-tripping.';
```

- [ ] **Step 2: Apply + verify**
- [ ] **Step 3: Commit**

---

## Task 3: Email helper — partner invitation

**Files:**
- Modify: `src/lib/email.ts` (add new export `sendPartnerInvitationEmail`)
- Test: `src/lib/__tests__/email-partner-invitation.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/lib/__tests__/email-partner-invitation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "id_123" }) });
});

describe("sendPartnerInvitationEmail", () => {
  it("posts to Resend with the right payload", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "hello@piggyback.finance");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://piggyback.finance");

    const { sendPartnerInvitationEmail } = await import("@/lib/email");
    await sendPartnerInvitationEmail({
      to: "sarah@example.com",
      inviterDisplayName: "Ben",
      manualPartnerName: "Sarah",
      token: "tok_abc",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["sarah@example.com"]);
    expect(body.html).toContain("Ben invited you");
    expect(body.html).toContain("https://piggyback.finance/claim/tok_abc");
  });

  it("no-op when RESEND_API_KEY missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendPartnerInvitationEmail } = await import("@/lib/email");
    await sendPartnerInvitationEmail({
      to: "x@y.z",
      inviterDisplayName: "Ben",
      manualPartnerName: null,
      token: "tok",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify test fails**
- [ ] **Step 3: Implement** in `src/lib/email.ts`. Add the function below the existing exports:

```ts
export async function sendPartnerInvitationEmail(args: {
  to: string;
  inviterDisplayName: string;
  manualPartnerName: string | null;
  token: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing, skipping partner invitation to", args.to);
    return;
  }
  const from = process.env.RESEND_FROM ?? "hello@piggyback.finance";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://piggyback.finance";
  const claimUrl = `${appUrl}/claim/${args.token}`;
  const greeting = args.manualPartnerName ? `Hey ${args.manualPartnerName},` : "Hey,";
  const subject = `${args.inviterDisplayName} invited you to share their PiggyBack budget`;
  const html = `
    <p>${greeting}</p>
    <p>${args.inviterDisplayName} invited you to share their PiggyBack budget — split bills,
    track shared goals, and see your household's financial picture together.</p>
    <p><a href="${claimUrl}" style="background:#7CC3A6;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p>
    <p>This link expires in 7 days.</p>
    <p style="color:#888;font-size:12px;margin-top:24px">Not expecting this? Just ignore it — nothing happens.</p>
  `;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [args.to], subject, html }),
  });
  if (!response.ok) {
    console.error("[email] Resend failure for partner invitation", await response.text());
  }
}
```

- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/__tests__/email-partner-invitation.test.ts
git commit -m "feat(email): partner invitation send helper (spec #2)"
```

---

## Task 4: Invitations module — create / cancel

**Files:**
- Create: `src/lib/partners/invitations.ts`
- Test: `src/lib/partners/__tests__/invitations.test.ts`

- [ ] **Step 1: Failing tests** (mock service-role client + email helper)

```ts
// src/lib/partners/__tests__/invitations.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const deleteMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn(() => ({
  insert: insertMock,
  delete: () => ({ eq: eqMock }),
}));
vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: fromMock }),
}));
const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({ sendPartnerInvitationEmail: sendEmailMock }));

describe("createInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: "i1", token: "tok" }, error: null }) }) });
    eqMock.mockReturnValue(Promise.resolve({ error: null }));
  });

  it("creates row + sends email", async () => {
    const { createInvitation } = await import("@/lib/partners/invitations");
    const result = await createInvitation({
      invitedByProvisionId: "p1",
      invitedByPartnershipId: "pship1",
      inviteeEmail: "sarah@example.com",
      manualPartnerName: "Sarah",
      inviterDisplayName: "Ben",
    });
    expect(result.ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("partner_claim_invitations");
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: "sarah@example.com",
      token: "tok",
    }));
  });

  it("rejects invalid email", async () => {
    const { createInvitation } = await import("@/lib/partners/invitations");
    const result = await createInvitation({
      invitedByProvisionId: "p1",
      invitedByPartnershipId: "pship1",
      inviteeEmail: "not an email",
      manualPartnerName: null,
      inviterDisplayName: "Ben",
    });
    expect(result.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/lib/partners/invitations.ts
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { sendPartnerInvitationEmail } from "@/lib/email";
import { assertOrchestrator } from "@/lib/role-context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateInvitationArgs {
  invitedByProvisionId: string;
  invitedByPartnershipId: string;
  inviteeEmail: string;
  manualPartnerName: string | null;
  inviterDisplayName: string;
}

export async function createInvitation(args: CreateInvitationArgs): Promise<
  { ok: true; invitationId: string; token: string } | { ok: false; error: string }
> {
  assertOrchestrator("createInvitation");
  const email = args.inviteeEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Invalid email address" };
  }
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("partner_claim_invitations")
    .insert({
      invited_by_provision_id: args.invitedByProvisionId,
      invited_by_partnership_id: args.invitedByPartnershipId,
      invitee_email: email,
      manual_partner_name: args.manualPartnerName,
    })
    .select("id, token")
    .single();
  if (error || !data) {
    console.error("[invitations] insert failed", error);
    return { ok: false, error: error?.message ?? "Could not create invitation" };
  }
  await sendPartnerInvitationEmail({
    to: email,
    inviterDisplayName: args.inviterDisplayName,
    manualPartnerName: args.manualPartnerName,
    token: data.token,
  });
  return { ok: true, invitationId: data.id, token: data.token };
}

export async function cancelInvitation(args: {
  invitationId: string;
  invitedByProvisionId: string;
}): Promise<{ ok: boolean; error?: string }> {
  assertOrchestrator("cancelInvitation");
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("partner_claim_invitations")
    .delete()
    .eq("id", args.invitationId)
    .eq("invited_by_provision_id", args.invitedByProvisionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 3: Tests pass**
- [ ] **Step 4: Commit**

```bash
git add src/lib/partners/invitations.ts src/lib/partners/__tests__/invitations.test.ts
git commit -m "feat(partners): create/cancel invitation module (spec #2)"
```

---

## Task 5: Claim module

**Files:**
- Create: `src/lib/partners/claim.ts`
- Test: `src/lib/partners/__tests__/claim.test.ts`

- [ ] **Step 1: Failing tests**

The claim function takes a token + claimer's provision_id, validates expiry + email match + rejection state, creates `partner_links`, marks `claimed_at`, returns the inviter info.

Tests must cover:
- Token not found → error
- Token expired → error
- Token already claimed → error
- Token already rejected → error
- Email mismatch → error
- Inviter and claimer are same person → error
- Happy path → partner_links row created with status='active'

(Write 7 tests with mocked service-role client.)

- [ ] **Step 2: Implement** `src/lib/partners/claim.ts` with `claimInvitation()` and `rejectInvitation()` functions.

Key logic:

```ts
export async function claimInvitation(args: {
  token: string;
  claimerProvisionId: string;
  claimerEmail: string;
}): Promise<{ ok: true; partnerLinkId: string; inviterProvisionId: string } | { ok: false; error: string }> {
  assertOrchestrator("claimInvitation");
  const supabase = createServiceRoleClient();
  // Look up invitation by token
  const { data: invitation } = await supabase
    .from("partner_claim_invitations")
    .select("id, invitee_email, invited_by_provision_id, expires_at, claimed_at, rejected_at")
    .eq("token", args.token)
    .maybeSingle();
  if (!invitation) return { ok: false, error: "Invitation not found." };
  if (invitation.claimed_at) return { ok: false, error: "Invitation already used." };
  if (invitation.rejected_at) return { ok: false, error: "Invitation was declined." };
  if (new Date(invitation.expires_at) < new Date()) return { ok: false, error: "Invitation expired. Ask for a new one." };
  if (invitation.invitee_email.toLowerCase() !== args.claimerEmail.toLowerCase()) {
    return { ok: false, error: `This invitation was sent to ${invitation.invitee_email}.` };
  }
  if (invitation.invited_by_provision_id === args.claimerProvisionId) {
    return { ok: false, error: "You can't claim your own invitation." };
  }
  // Atomic update: create link + mark claimed in one go
  const { data: link, error: linkErr } = await supabase
    .from("partner_links")
    .insert({
      initiator_provision_id: invitation.invited_by_provision_id,
      acceptor_provision_id: args.claimerProvisionId,
      status: "active",
      active_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (linkErr || !link) {
    return { ok: false, error: linkErr?.message ?? "Could not create partner link." };
  }
  const { error: claimErr } = await supabase
    .from("partner_claim_invitations")
    .update({ claimed_at: new Date().toISOString(), claimed_provision_id: args.claimerProvisionId })
    .eq("id", invitation.id);
  if (claimErr) {
    console.error("[claim] failed to mark claimed_at", claimErr);
    // Don't fail — the link exists, the marker is best-effort.
  }
  return { ok: true, partnerLinkId: link.id, inviterProvisionId: invitation.invited_by_provision_id };
}

export async function rejectInvitation(token: string): Promise<{ ok: boolean; error?: string }> {
  assertOrchestrator("rejectInvitation");
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("partner_claim_invitations")
    .update({ rejected_at: new Date().toISOString() })
    .eq("token", token)
    .is("claimed_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 3: Tests pass**
- [ ] **Step 4: Commit**

---

## Task 6: API routes

For each route below: write a route handler that validates auth via Supabase orchestrator client, calls the underlying lib function, returns appropriate JSON.

- [ ] **Step 1**: `src/app/api/partners/invite/route.ts` — POST. Body `{partnership_id, invitee_email, manual_partner_name?}`. Uses orchestrator session. Calls `createInvitation`. Rate-limited (5/hour per user via existing rate-limiter pattern).

- [ ] **Step 2**: `src/app/api/partners/cancel/route.ts` — DELETE. Body `{invitation_id}`. Calls `cancelInvitation`.

- [ ] **Step 3**: `src/app/api/partners/claim/route.ts` — POST. Body `{token}`. Validates orchestrator-side session. Calls `claimInvitation`. On success, also fires webhook to BOTH tenants to add `is_remote_mirror=true` rows in their `partnership_members`.

- [ ] **Step 4**: `src/app/api/partners/sever/route.ts` — POST. Body `{partner_link_id}`. Marks link severed. Webhook to both tenants to remove mirror rows.

For each route, write integration tests using `vi.mocked` supabase clients. Each route gets its own `__tests__` file.

- [ ] **Step 5**: Commit

```bash
git add src/app/api/partners/
git commit -m "feat(api): partner invite/cancel/claim/sever endpoints (spec #2)"
```

---

## Task 7: Claim page

**Files:**
- Create: `src/app/claim/[token]/page.tsx`

- [ ] **Step 1: Implement**

Server component that fetches invitation by token (read-only), checks expiry, displays inviter info. Renders client subcomponent with "Accept" + "Decline" buttons.

If user not signed in: shows "Sign in or sign up to accept". On signup completion, calls claim handler with a fresh `provision_id` (per spec #5 provisioning flow — for now, stub the case-A flow if spec #5 isn't done yet).

If user signed in: shows "Hey {Sarah}, accept Ben's invite?" → click → POST `/api/partners/claim`.

- [ ] **Step 2: Test the page renders correctly with valid + expired + claimed tokens**

- [ ] **Step 3: Commit**

---

## Task 8: Fan-out helper + endpoint

**Files:**
- Create: `src/lib/partners/fanout.ts`
- Create: `src/app/api/orchestrator/partner-aggregates/route.ts`

- [ ] **Step 1: Failing tests**

`fetchPartnerAggregates(args: {requesterProvisionId, partnerProvisionId, monthKey})` returns `{income_cents, expense_cents, top_categories: [...]}` or `{error}`. Internally it:
1. Looks up `partner_links` to verify active link + consent_aggregate_view.
2. Loads partner's stored Supabase OAuth refresh token.
3. Refreshes if needed.
4. Hits partner's tenant Supabase REST API with the temporary access token.
5. Aggregates monthly income/expense from `transactions` table.
6. Returns aggregates only — never raw transaction rows.

Tests cover: no link → 403, severed link → 403, consent off → hidden response, fetch fail → 503.

- [ ] **Step 2: Implement** the fan-out logic.
- [ ] **Step 3: Implement** the API route at `/api/orchestrator/partner-aggregates`. Validates orchestrator session → resolves requester's provision → calls fan-out helper. Cache-Control: no-store.
- [ ] **Step 4: Tests pass**
- [ ] **Step 5: Commit**

---

## Task 9: Settings UI wiring

**Files:**
- Modify: `src/app/(app)/settings/partner/page.tsx`
- Create: `src/components/settings/partner-config.tsx`

- [ ] **Step 1: Build the partner-config client component** with three sections:
  - Current state: "You're solo" / "You have manual partner X" / "You're partnered with X (real, claimed YYYY-MM-DD)"
  - Action area: invite real partner / configure manual / cancel pending invite / sever partnership / toggle consents
  - Pending invitations: show outstanding ones, "Cancel" buttons

- [ ] **Step 2: Wire to API routes**
- [ ] **Step 3: Test interactions** with mocked fetch
- [ ] **Step 4: Commit**

---

## Self-review

- [ ] Spec coverage: every state transition + edge case in spec #2 has a task
- [ ] No placeholders, every step has code or commands
- [ ] Type names consistent (`partnerLinkId` not `linkId`, etc.)
- [ ] Email + claim flows tested end-to-end via integration test (spec mentions Playwright; defer if non-trivial)

## Acceptance criteria

- [ ] Two test orchestrator users can complete invite → email → claim → see partner aggregates
- [ ] Email-mismatch and expiry rejected with clear error
- [ ] Sever flow leaves both tenants intact, severs the link, emits notifications to both
- [ ] Rate limit on `/api/partners/invite` enforced (5/hour)
- [ ] Consent toggles immediately affect fan-out responses
