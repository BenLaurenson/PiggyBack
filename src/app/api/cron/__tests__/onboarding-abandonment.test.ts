/**
 * Unit tests for the onboarding-abandonment cron route. Verifies:
 *   - The CRON_SECRET bearer-token gate
 *   - Lookup of stuck users (state ≠ READY/ABANDONED, changed > 7 days ago)
 *   - Per-user RPC fan-out + counting
 *   - Idempotent re-run safety (no spurious counts when no users qualify)
 *
 * Spec: docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

const CRON_SECRET = "test-cron-secret";

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  vi.resetAllMocks();
  vi.resetModules();
});

function makeRequest(authHeader?: string) {
  return new Request("http://localhost/api/cron/onboarding-abandonment", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

function makeSupabaseMock(stuckRows: Array<{ id: string }>, rpcResponses: Record<string, string | null> = {}) {
  const rpcMock = vi.fn(async (_fn: string, args: { p_user_id: string }) => {
    // null means "RPC failed" — distinct from "user wasn't in the
    // overrides map" (which means use the default 'ABANDONED').
    const hasOverride = Object.prototype.hasOwnProperty.call(rpcResponses, args.p_user_id);
    if (hasOverride && rpcResponses[args.p_user_id] === null) {
      return { data: null, error: { message: "boom" } };
    }
    const result = hasOverride ? rpcResponses[args.p_user_id] : "ABANDONED";
    return { data: result, error: null };
  });

  // The select chain: from('profiles').select('id').not(...).lt(...) → rows
  const ltMock = vi.fn(() => Promise.resolve({ data: stuckRows, error: null }));
  const notMock = vi.fn(() => ({ lt: ltMock }));
  const selectMock = vi.fn(() => ({ not: notMock }));

  return {
    from: vi.fn(() => ({ select: selectMock })),
    rpc: rpcMock,
    _rpcMock: rpcMock,
    _ltMock: ltMock,
  };
}

describe("/api/cron/onboarding-abandonment", () => {
  it("returns 401 without a valid bearer token", async () => {
    const { GET } = await import("@/app/api/cron/onboarding-abandonment/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with the wrong bearer token", async () => {
    const { GET } = await import("@/app/api/cron/onboarding-abandonment/route");
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("counts ABANDONED transitions for stuck users", async () => {
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const supabase = makeSupabaseMock([{ id: "u1" }, { id: "u2" }, { id: "u3" }]);
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supabase);

    const { GET } = await import("@/app/api/cron/onboarding-abandonment/route");
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 3, abandoned: 3 });
    expect(supabase._rpcMock).toHaveBeenCalledTimes(3);
    expect(supabase._rpcMock).toHaveBeenCalledWith("force_set_onboarding_state", {
      p_user_id: "u1",
      p_to: "ABANDONED",
      p_reason: "timeout",
    });
  });

  it("does not count failed RPCs", async () => {
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const supabase = makeSupabaseMock(
      [{ id: "u1" }, { id: "u2" }],
      { u1: null }, // RPC error for u1
    );
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supabase);

    const { GET } = await import("@/app/api/cron/onboarding-abandonment/route");
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 2, abandoned: 1 });
  });

  it("returns checked=0 when nobody is stuck", async () => {
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const supabase = makeSupabaseMock([]);
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supabase);

    const { GET } = await import("@/app/api/cron/onboarding-abandonment/route");
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 0, abandoned: 0 });
    expect(supabase._rpcMock).not.toHaveBeenCalled();
  });

  it("queries stuck users with the 7-day cutoff", async () => {
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const supabase = makeSupabaseMock([]);
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(supabase);

    const before = Date.now();
    const { GET } = await import("@/app/api/cron/onboarding-abandonment/route");
    await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const after = Date.now();

    expect(supabase._ltMock).toHaveBeenCalledTimes(1);
    const [field, cutoff] = supabase._ltMock.mock.calls[0] as unknown as [string, string];
    expect(field).toBe("onboarding_state_changed_at");
    const cutoffMs = new Date(cutoff).getTime();
    const expectedMin = before - 7 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 7 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });
});
