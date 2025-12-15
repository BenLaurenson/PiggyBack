import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/demo-guard", () => ({
  demoActionGuard: vi.fn(() => null),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/create-notification", () => ({
  createNotification: vi.fn(() => Promise.resolve({ success: true })),
  isNotificationEnabled: vi.fn(() => Promise.resolve(true)),
}));

function createGoalsMockSupabase(goalData: Record<string, unknown> | null = null) {
  const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
  updateChain.eq = vi.fn(() => Promise.resolve({ error: null }));
  updateChain.update = vi.fn(() => updateChain);

  const insertMock = vi.fn(() => ({
    then: vi.fn((cb: any) => cb({ error: null })),
  }));

  const selectChain: Record<string, ReturnType<typeof vi.fn>> = {};
  selectChain.select = vi.fn(() => selectChain);
  selectChain.eq = vi.fn(() => selectChain);
  selectChain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: goalData, error: null })
  );

  return {
    from: vi.fn(() => ({
      select: selectChain.select,
      update: updateChain.update,
      insert: insertMock,
      eq: vi.fn(),
    })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: "user-1" } } })
      ),
    },
    _selectChain: selectChain,
    _updateChain: updateChain,
    _insertMock: insertMock,
  };
}

describe("goals actions — milestone notifications", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates 25% milestone notification when crossing threshold", async () => {
    // Goal: target 10000, current 2000, adding 600 → new 2600 (26%)
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 2000,
      target_amount_cents: 10000,
      name: "Emergency Fund",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { addFundsToGoal } = await import("@/app/actions/goals");
    await addFundsToGoal("goal-1", 600);

    // Wait for async notification (fire and forget)
    await new Promise((r) => setTimeout(r, 50));

    const { createNotification } = await import("@/lib/create-notification");
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "goal_milestone",
        metadata: expect.objectContaining({
          milestone_percent: 25,
          goal_name: "Emergency Fund",
        }),
      })
    );
  });

  it("creates 50% milestone notification", async () => {
    // Goal: target 10000, current 4500, adding 600 → new 5100 (51%)
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 4500,
      target_amount_cents: 10000,
      name: "Holiday Fund",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { addFundsToGoal } = await import("@/app/actions/goals");
    await addFundsToGoal("goal-1", 600);

    await new Promise((r) => setTimeout(r, 50));

    const { createNotification } = await import("@/lib/create-notification");
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ milestone_percent: 50 }),
      })
    );
  });

  it("creates 75% milestone notification", async () => {
    // Goal: target 10000, current 7000, adding 600 → new 7600 (76%)
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 7000,
      target_amount_cents: 10000,
      name: "Car Fund",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { addFundsToGoal } = await import("@/app/actions/goals");
    await addFundsToGoal("goal-1", 600);

    await new Promise((r) => setTimeout(r, 50));

    const { createNotification } = await import("@/lib/create-notification");
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ milestone_percent: 75 }),
      })
    );
  });

  it("creates 100% completion notification", async () => {
    // Goal: target 10000, current 9500, adding 600 → new 10100 (101%)
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 9500,
      target_amount_cents: 10000,
      name: "Laptop",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { addFundsToGoal } = await import("@/app/actions/goals");
    await addFundsToGoal("goal-1", 600);

    await new Promise((r) => setTimeout(r, 50));

    const { createNotification } = await import("@/lib/create-notification");
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Laptop complete!",
        metadata: expect.objectContaining({ milestone_percent: 100 }),
      })
    );
  });

  it("does not create notification when not crossing a milestone", async () => {
    // Goal: target 10000, current 3000, adding 100 → new 3100 (31% — between 25% and 50%)
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 3000,
      target_amount_cents: 10000,
      name: "Test Goal",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { addFundsToGoal } = await import("@/app/actions/goals");
    await addFundsToGoal("goal-1", 100);

    await new Promise((r) => setTimeout(r, 50));

    const { createNotification } = await import("@/lib/create-notification");
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("does not create notification when goal_milestones preference disabled", async () => {
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 2000,
      target_amount_cents: 10000,
      name: "Test Goal",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { isNotificationEnabled } = await import("@/lib/create-notification");
    (isNotificationEnabled as any).mockResolvedValue(false);

    const { addFundsToGoal } = await import("@/app/actions/goals");
    await addFundsToGoal("goal-1", 600);

    await new Promise((r) => setTimeout(r, 50));

    const { createNotification } = await import("@/lib/create-notification");
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("still updates goal even if notification creation fails", async () => {
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 2000,
      target_amount_cents: 10000,
      name: "Test Goal",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { createNotification } = await import("@/lib/create-notification");
    (createNotification as any).mockRejectedValue(new Error("Notification failed"));

    const { addFundsToGoal } = await import("@/app/actions/goals");
    const result = await addFundsToGoal("goal-1", 600);

    // Goal should still update successfully
    expect(result).toEqual({ success: true });
  });

  it("addFundsToGoal records a contribution to goal_contributions", async () => {
    const mockSupabase = createGoalsMockSupabase({
      current_amount_cents: 5000,
      target_amount_cents: 10000,
      name: "Test Goal",
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    const { addFundsToGoal } = await import("@/app/actions/goals");
    const result = await addFundsToGoal("goal-1", 2000);

    expect(result).toEqual({ success: true });

    // Verify insert was called for goal_contributions
    // The from() call for goal_contributions should trigger insert
    const fromCalls = mockSupabase.from.mock.calls;
    const contributionCall = fromCalls.find(
      (call: string[]) => call[0] === "goal_contributions"
    );
    expect(contributionCall).toBeDefined();
  });

  it("markGoalComplete creates 100% completion notification", async () => {
    const mockSupabase = createGoalsMockSupabase({
      name: "Savings",
      current_amount_cents: 8000,
      target_amount_cents: 10000,
    });

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);

    // Explicitly reset mock implementations (may be stale from prior tests)
    const { createNotification, isNotificationEnabled } = await import("@/lib/create-notification");
    (isNotificationEnabled as any).mockImplementation(() => Promise.resolve(true));
    (createNotification as any).mockImplementation(() => Promise.resolve({ success: true }));

    const { markGoalComplete } = await import("@/app/actions/goals");
    await markGoalComplete("goal-1");

    await new Promise((r) => setTimeout(r, 50));

    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "goal_milestone",
        metadata: expect.objectContaining({ milestone_percent: 100 }),
      })
    );
  });
});
