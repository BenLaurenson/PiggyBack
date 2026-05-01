# Onboarding State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` tracking.

**Goal:** Replace the FE-managed `completedSteps` array with a BE-driven state machine on `profiles.onboarding_state`. Resumable across tabs, devices, and crashes. Single source of truth for "is this user ready?".

**Architecture:** A SQL ENUM column + audit table + transition server action + cron for abandonment. The wizard becomes a thin renderer.

---

**Spec:** `docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md`. **Depends on:** plan #1 (role-context helper).

---

## File structure

**New:**
- `src/lib/onboarding/state.ts` — server action `advanceOnboardingState`, helper `getOnboardingState`, types
- `src/lib/onboarding/__tests__/state.test.ts`
- `src/app/api/cron/onboarding-abandonment/route.ts` — daily cron
- `supabase/migrations/20260501000005_onboarding_state_machine.sql`

**Modify:**
- `src/components/onboarding/onboarding-wizard.tsx` — read state from prop, transition via server action, no internal `completedSteps` state
- `src/app/(onboarding)/onboarding/page.tsx` — pass new state field instead of array
- `src/components/onboarding/steps/bank-step.tsx` — call `advanceOnboardingState('INCOME')` after successful sync, not before
- `src/components/onboarding/steps/{profile,income,ai}-step.tsx` — call advance on completion
- `src/app/actions/onboarding.ts` — replace `persistOnboardingStep` (deprecated) with `advanceOnboardingState`
- `vercel.json` — add the abandonment cron entry

---

## Task 1: Migration — onboarding state column + audit table

**Files:**
- Create: `supabase/migrations/20260501000005_onboarding_state_machine.sql`

- [ ] **Step 1: Write SQL**

```sql
-- 20260501000005_onboarding_state_machine.sql
-- Spec: docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_state text NOT NULL DEFAULT 'PROVISIONING'
    CHECK (onboarding_state IN ('PROVISIONING','PROFILE','BANK','INCOME','AI','PARTNER','READY','ABANDONED')),
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS onboarding_state_changed_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.onboarding_state_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_state_audit_user_id_idx
  ON public.onboarding_state_audit(user_id, occurred_at DESC);

ALTER TABLE public.onboarding_state_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own onboarding audit" ON public.onboarding_state_audit;
CREATE POLICY "Users can read their own onboarding audit"
  ON public.onboarding_state_audit FOR SELECT TO authenticated
  USING (user_id = auth.uid());
GRANT SELECT ON public.onboarding_state_audit TO authenticated;
GRANT ALL ON public.onboarding_state_audit TO service_role;

-- Optimistic-concurrency state transition function
CREATE OR REPLACE FUNCTION public.advance_onboarding_state(
  p_user_id uuid,
  p_from text,
  p_to text,
  p_reason text DEFAULT 'user_action'
)
RETURNS text  -- the resulting state (could be the original if WHERE didn't match)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_state text;
BEGIN
  UPDATE public.profiles
  SET onboarding_state = p_to,
      onboarding_state_changed_at = now()
  WHERE id = p_user_id
    AND onboarding_state = p_from
  RETURNING onboarding_state INTO current_state;

  IF current_state IS NOT NULL THEN
    INSERT INTO public.onboarding_state_audit (user_id, from_state, to_state, reason)
    VALUES (p_user_id, p_from, p_to, p_reason);
    RETURN current_state;
  END IF;

  -- WHERE didn't match — return whatever the actual state is
  SELECT onboarding_state INTO current_state FROM public.profiles WHERE id = p_user_id;
  RETURN current_state;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_onboarding_state(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_onboarding_state(uuid, text, text, text) TO authenticated, service_role;

-- Backfill existing rows from onboarding_steps_completed
-- (mapping: profile + bank + income + ai = READY, has_onboarded=true = READY,
--  otherwise compute based on which steps are present)
UPDATE public.profiles
SET onboarding_state = CASE
  WHEN has_onboarded = true THEN 'READY'
  WHEN 'ai' = ANY(onboarding_steps_completed) THEN 'PARTNER'
  WHEN 'income' = ANY(onboarding_steps_completed) THEN 'AI'
  WHEN 'bank' = ANY(onboarding_steps_completed) THEN 'INCOME'
  WHEN 'profile' = ANY(onboarding_steps_completed) THEN 'BANK'
  WHEN display_name IS NOT NULL THEN 'BANK'
  ELSE 'PROFILE'
END
WHERE onboarding_state = 'PROVISIONING';  -- only newly-defaulted rows
```

- [ ] **Step 2: Apply via MCP** (dev DB). Verify column + function exist.
- [ ] **Step 3: Commit**

---

## Task 2: Replace persistOnboardingStep with advanceOnboardingState

**Files:**
- Modify: `src/app/actions/onboarding.ts`
- Test: `src/app/actions/__tests__/onboarding.test.ts`

- [ ] **Step 1: Failing test**

```ts
// src/app/actions/__tests__/onboarding.test.ts
import { describe, it, expect, vi } from "vitest";

const rpcMock = vi.fn();
const getUserMock = vi.fn();
vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  }),
}));

describe("advanceOnboardingState", () => {
  it("calls SQL function with right args", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: "INCOME", error: null });
    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    const result = await advanceOnboardingState("BANK", "INCOME");
    expect(rpcMock).toHaveBeenCalledWith("advance_onboarding_state", {
      p_user_id: "u1", p_from: "BANK", p_to: "INCOME", p_reason: "user_action",
    });
    expect(result).toEqual({ ok: true, currentState: "INCOME" });
  });

  it("returns false when SQL says state didn't transition", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: "PROFILE", error: null });
    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    const result = await advanceOnboardingState("BANK", "INCOME");
    expect(result).toEqual({ ok: false, currentState: "PROFILE", reason: "state mismatch" });
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/app/actions/onboarding.ts (replace existing persistOnboardingStep)
"use server";
import { createClient } from "@/utils/supabase/server";
import { demoActionGuard } from "@/lib/demo-guard";

const VALID_STATES = ["PROVISIONING","PROFILE","BANK","INCOME","AI","PARTNER","READY","ABANDONED"] as const;
type OnboardingState = typeof VALID_STATES[number];

export async function advanceOnboardingState(
  fromState: OnboardingState,
  toState: OnboardingState,
  reason: string = "user_action"
): Promise<{ ok: true; currentState: OnboardingState } | { ok: false; currentState: OnboardingState; reason: string }> {
  const blocked = demoActionGuard();
  if (blocked) return { ok: false, currentState: fromState, reason: "demo mode" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, currentState: fromState, reason: "not authenticated" };
  const { data, error } = await supabase.rpc("advance_onboarding_state", {
    p_user_id: user.id, p_from: fromState, p_to: toState, p_reason: reason,
  });
  if (error || !data) return { ok: false, currentState: fromState, reason: error?.message ?? "rpc failed" };
  if (data !== toState) {
    return { ok: false, currentState: data as OnboardingState, reason: "state mismatch" };
  }
  return { ok: true, currentState: data as OnboardingState };
}

// Keep persistOnboardingStep as deprecated stub during transition
/** @deprecated use advanceOnboardingState */
export async function persistOnboardingStep(_stepId: string) {
  return { ok: true };
}

export async function completeOnboarding(_stepsCompleted: string[]) {
  // Replace with: advance to READY from current state
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await supabase.rpc("advance_onboarding_state", {
    p_user_id: user.id, p_from: "PARTNER", p_to: "READY", p_reason: "user_action",
  });
  await supabase
    .from("profiles")
    .update({ has_onboarded: true, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
}
```

- [ ] **Step 3: Tests pass**
- [ ] **Step 4: Commit**

---

## Task 3: Wizard refactor

**Files:**
- Modify: `src/components/onboarding/onboarding-wizard.tsx`
- Modify: `src/app/(onboarding)/onboarding/page.tsx`

- [ ] **Step 1: Page passes `onboarding_state` instead of `stepsCompleted`**

Replace the steps-completed hydration logic in `page.tsx` with simply:

```ts
const profile = await supabase
  .from("profiles")
  .select("display_name, has_onboarded, onboarding_state")
  .eq("id", user.id)
  .maybeSingle();

if (profile?.has_onboarded === true || profile?.data?.onboarding_state === "READY") {
  redirect("/home");
}

return (
  <OnboardingWizard
    userId={user.id}
    email={user.email || ""}
    existingDisplayName={profile?.data?.display_name || ""}
    initialState={profile?.data?.onboarding_state || "PROFILE"}
  />
);
```

- [ ] **Step 2: Wizard refactored to use state**

```tsx
// src/components/onboarding/onboarding-wizard.tsx
"use client";
import { useState, useTransition } from "react";
import { advanceOnboardingState } from "@/app/actions/onboarding";

const STEP_ORDER = ["PROFILE","BANK","INCOME","AI","PARTNER","READY"] as const;

export function OnboardingWizard({ userId, email, existingDisplayName, initialState }) {
  const [currentState, setCurrentState] = useState(initialState);
  const [isPending, startTransition] = useTransition();

  const advance = (next) => startTransition(async () => {
    const r = await advanceOnboardingState(currentState, next);
    if (r.ok) setCurrentState(next);
    else if (r.currentState !== currentState) setCurrentState(r.currentState);
    if (next === "READY") router.push("/home");
  });

  // render based on currentState; pass `advance` to step components as their onComplete
}
```

- [ ] **Step 3: Update each step component** to call `advance(nextState)` instead of `markStepComplete + handleNext`.

- [ ] **Step 4: Wizard renders the right step for any state** — including "Welcome" when state is PROFILE and user hasn't seen Welcome yet (use a localStorage flag for one-time Welcome shown).

- [ ] **Step 5: Test the wizard renders correctly for each starting state**

- [ ] **Step 6: Commit**

---

## Task 4: BANK-specific deferred advance

**Files:**
- Modify: `src/components/onboarding/steps/bank-step.tsx`

- [ ] **Step 1: Only advance to INCOME when at least one account has been synced**

In the existing `handleConnect`/`handleRetrySync`, after `runSyncWithAutoRetry()` returns done:

```ts
// At least one account succeeded if syncErrors.length < total accounts.
// Easier signal: check accounts table for any with last_synced_at NOT NULL.
const supabase = createClient();
const { count } = await supabase
  .from("accounts")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId)
  .not("last_synced_at", "is", null);
if ((count ?? 0) > 0) {
  await advanceOnboardingState("BANK", "INCOME", "user_action");
}
```

- [ ] **Step 2: If user closes tab mid-sync, the next page load shows them at BANK with a "looks like you started syncing earlier — continue?" pickup option.**

Add server-side check in `/onboarding/page.tsx`: if `onboarding_state === 'BANK'` AND the user has accounts with `last_synced_at NOT NULL`, surface a banner suggesting they advance.

- [ ] **Step 3: Test**: simulate "close tab during sync" by aborting the fetch mid-stream + reloading. Verify state machine catches up.

- [ ] **Step 4: Commit**

---

## Task 5: Abandonment cron

**Files:**
- Create: `src/app/api/cron/onboarding-abandonment/route.ts`
- Modify: `vercel.json` (add cron entry)

- [ ] **Step 1: Implement cron route**

```ts
// src/app/api/cron/onboarding-abandonment/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  // Mark anyone in non-READY/ABANDONED for >7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stuck } = await supabase
    .from("profiles")
    .select("id")
    .not("onboarding_state", "in", '("READY","ABANDONED")')
    .lt("onboarding_state_changed_at", cutoff);

  let abandoned = 0;
  for (const row of stuck ?? []) {
    const { data } = await supabase.rpc("advance_onboarding_state", {
      p_user_id: row.id, p_from: undefined, p_to: "ABANDONED", p_reason: "timeout",
    });
    if (data === "ABANDONED") abandoned++;
    // TODO email re-engagement message via Resend
  }
  return NextResponse.json({ checked: stuck?.length ?? 0, abandoned });
}
```

Note: `advance_onboarding_state` requires `p_from` to match. For cron-driven transitions, we need a separate function `force_set_onboarding_state` that doesn't enforce optimistic concurrency. Add it to the migration.

Actually let's bake that in:

```sql
-- Add to migration
CREATE OR REPLACE FUNCTION public.force_set_onboarding_state(
  p_user_id uuid, p_to text, p_reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_state text;
BEGIN
  SELECT onboarding_state INTO old_state FROM profiles WHERE id = p_user_id;
  UPDATE profiles SET onboarding_state = p_to, onboarding_state_changed_at = now() WHERE id = p_user_id;
  INSERT INTO onboarding_state_audit (user_id, from_state, to_state, reason)
  VALUES (p_user_id, old_state, p_to, p_reason);
  RETURN p_to;
END; $$;
GRANT EXECUTE ON FUNCTION public.force_set_onboarding_state(uuid, text, text) TO service_role;
```

(Update the cron to call this instead.)

- [ ] **Step 2: Add to vercel.json**

```json
{ "path": "/api/cron/onboarding-abandonment", "schedule": "0 2 * * *" }
```

(Replace one of the existing 5 — we're at the cap. Probably ok to evict `release-aliases` for now, or upgrade to Pro.)

- [ ] **Step 3: Test the route locally with mocked auth**
- [ ] **Step 4: Commit**

---

## Self-review

- [ ] All transitions in spec covered (NEW→PROVISIONING handled by spec #5 via orchestrator)
- [ ] Backwards compat: existing users get migrated correctly via the SQL backfill
- [ ] No FE state drift — wizard reads from BE
- [ ] Abandonment cron actually transitions stuck users
- [ ] Two-tab race: `advance_onboarding_state` WHERE-based optimistic-concurrency means only one wins

## Acceptance criteria

- [ ] Brand-new signup: PROFILE → READY in <2 min via wizard, with each step durably persisted
- [ ] Closing tab + reopening puts user on the right step
- [ ] Two devices simultaneously transitioning: only one succeeds; the other reads back current state
- [ ] Abandonment cron flips stuck users to ABANDONED
- [ ] Existing has_onboarded users redirect to /home from /onboarding
