/**
 * Unit tests for advanceOnboardingState — the BE-driven state machine
 * server action. Validates SQL RPC dispatch, optimistic-concurrency
 * mismatch handling, demo-mode short-circuit, and unauthenticated
 * fall-through.
 *
 * Spec: docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md
 * Plan: docs/superpowers/plans/2026-05-01-03-onboarding-state-machine-plan.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const getUserMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
const fromMock = vi.fn(() => ({ update: updateMock }));

vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: fromMock,
  }),
}));

type DemoGuardResult = { error: string; demo: true; success: false } | null;
const demoGuardMock = vi.fn<() => DemoGuardResult>(() => null);
vi.mock("@/lib/demo-guard", () => ({
  demoActionGuard: () => demoGuardMock(),
}));

vi.mock("@/lib/analytics/server", () => ({
  track: vi.fn(),
}));

vi.mock("@/lib/analytics/events", () => ({
  FunnelEvent: { TENANT_READY: "tenant_ready" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  demoGuardMock.mockReturnValue(null);
});

describe("advanceOnboardingState", () => {
  it("calls SQL function with right args and returns ok on success", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: "INCOME", error: null });

    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    const result = await advanceOnboardingState("BANK", "INCOME");

    expect(rpcMock).toHaveBeenCalledWith("advance_onboarding_state", {
      p_user_id: "u1",
      p_from: "BANK",
      p_to: "INCOME",
      p_reason: "user_action",
    });
    expect(result).toEqual({ ok: true, currentState: "INCOME" });
  });

  it("returns ok=false with current state when SQL says state didn't transition", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    // RPC returned PROFILE — meaning the WHERE didn't match (user is still in PROFILE,
    // not BANK as the FE thought). The losing client should reconcile.
    rpcMock.mockResolvedValue({ data: "PROFILE", error: null });

    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    const result = await advanceOnboardingState("BANK", "INCOME");

    expect(result).toEqual({
      ok: false,
      currentState: "PROFILE",
      reason: "state mismatch",
    });
  });

  it("short-circuits in demo mode without calling RPC", async () => {
    demoGuardMock.mockReturnValue({ error: "Demo mode", demo: true, success: false });

    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    const result = await advanceOnboardingState("BANK", "INCOME");

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("demo mode");
    }
  });

  it("returns ok=false when not authenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    const result = await advanceOnboardingState("BANK", "INCOME");

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not authenticated");
    }
  });

  it("returns ok=false with the rpc error message when RPC fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    const result = await advanceOnboardingState("BANK", "INCOME");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("boom");
    }
  });

  it("forwards a custom reason to the RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: "INCOME", error: null });

    const { advanceOnboardingState } = await import("@/app/actions/onboarding");
    await advanceOnboardingState("BANK", "INCOME", "auto_skip");

    expect(rpcMock).toHaveBeenCalledWith("advance_onboarding_state", expect.objectContaining({
      p_reason: "auto_skip",
    }));
  });
});
