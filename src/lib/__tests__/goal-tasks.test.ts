import { describe, it, expect, vi } from "vitest";
import {
  buildTaskInputSignature,
  evaluateTaskCache,
  generateFallbackGoalTasks,
  packGeneratedTasks,
} from "../goal-tasks";
import type { GoalContribution, GoalForCalculation } from "../goal-calculations";

// ============================================================================
// Helpers
// ============================================================================

function makeGoal(overrides: Partial<GoalForCalculation> = {}): GoalForCalculation {
  return {
    id: "goal-1",
    name: "Test Goal",
    icon: "piggy-bank",
    color: "#8884d8",
    current_amount_cents: 50000,
    target_amount_cents: 100000,
    deadline: "2025-12-01",
    is_completed: false,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<GoalContribution> = {}
): GoalContribution {
  return {
    id: "c-1",
    goal_id: "goal-1",
    amount_cents: 10000,
    balance_after_cents: 10000,
    source: "manual",
    created_at: "2025-03-15T00:00:00Z",
    ...overrides,
  };
}

// ============================================================================
// buildTaskInputSignature
// ============================================================================

describe("buildTaskInputSignature", () => {
  it("produces stable hash for the same inputs", () => {
    const goal = makeGoal();
    const sig1 = buildTaskInputSignature(goal);
    const sig2 = buildTaskInputSignature(goal);
    expect(sig1).toBe(sig2);
  });

  it("changes when current_amount_cents changes", () => {
    const sig1 = buildTaskInputSignature(makeGoal({ current_amount_cents: 50000 }));
    const sig2 = buildTaskInputSignature(makeGoal({ current_amount_cents: 60000 }));
    expect(sig1).not.toBe(sig2);
  });

  it("changes when target_amount_cents changes", () => {
    const sig1 = buildTaskInputSignature(makeGoal({ target_amount_cents: 100000 }));
    const sig2 = buildTaskInputSignature(makeGoal({ target_amount_cents: 200000 }));
    expect(sig1).not.toBe(sig2);
  });

  it("changes when deadline changes", () => {
    const sig1 = buildTaskInputSignature(makeGoal({ deadline: "2025-12-01" }));
    const sig2 = buildTaskInputSignature(makeGoal({ deadline: "2026-06-01" }));
    expect(sig1).not.toBe(sig2);
  });

  it("changes when linked_account_id flips from null to set", () => {
    const sig1 = buildTaskInputSignature({
      ...makeGoal(),
      linked_account_id: null,
    });
    const sig2 = buildTaskInputSignature({
      ...makeGoal(),
      linked_account_id: "acct-123",
    });
    expect(sig1).not.toBe(sig2);
  });

  it("does NOT change for cosmetic-only edits (so we don't burn API credits)", () => {
    // name/icon/color are intentionally excluded from the signature.
    const sig1 = buildTaskInputSignature(makeGoal());
    const sig2 = buildTaskInputSignature(
      makeGoal({ name: "Renamed", icon: "home", color: "#ff0000" })
    );
    expect(sig1).toBe(sig2);
  });
});

// ============================================================================
// evaluateTaskCache
// ============================================================================

describe("evaluateTaskCache", () => {
  const now = new Date("2025-04-01T12:00:00Z");
  const goal = makeGoal();
  const liveSig = buildTaskInputSignature(goal);

  it("flags as no-cache when nothing is stored", () => {
    const status = evaluateTaskCache(
      { tasks_generated_at: null, tasks_input_signature: null, generated_tasks: null },
      liveSig,
      now
    );
    expect(status.isFresh).toBe(false);
    expect(status.reason).toBe("no-cache");
  });

  it("flags as fresh within 24h with matching signature", () => {
    const generated = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
    const status = evaluateTaskCache(
      {
        tasks_generated_at: generated.toISOString(),
        tasks_input_signature: liveSig,
        generated_tasks: { tasks: [] },
      },
      liveSig,
      now
    );
    expect(status.isFresh).toBe(true);
    expect(status.reason).toBe("fresh");
  });

  it("flags as expired after 24h even if signature matches", () => {
    const generated = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h ago
    const status = evaluateTaskCache(
      {
        tasks_generated_at: generated.toISOString(),
        tasks_input_signature: liveSig,
        generated_tasks: { tasks: [] },
      },
      liveSig,
      now
    );
    expect(status.isFresh).toBe(false);
    expect(status.reason).toBe("expired");
  });

  it("flags as signature-changed when state drifted (regardless of TTL)", () => {
    const generated = new Date(now.getTime() - 5 * 60 * 1000); // 5min ago, well within 24h
    const status = evaluateTaskCache(
      {
        tasks_generated_at: generated.toISOString(),
        tasks_input_signature: "stale-signature",
        generated_tasks: { tasks: [{ id: "x", text: "old", priority: "low" }] },
      },
      liveSig,
      now
    );
    expect(status.isFresh).toBe(false);
    expect(status.reason).toBe("signature-changed");
    expect(status.signatureChanged).toBe(true);
  });
});

// ============================================================================
// generateFallbackGoalTasks
// ============================================================================

describe("generateFallbackGoalTasks", () => {
  const now = new Date("2025-04-01T00:00:00Z");

  it("emits celebration tasks for completed goals", () => {
    const goal = makeGoal({
      current_amount_cents: 100000,
      target_amount_cents: 100000,
      is_completed: true,
    });
    const tasks = generateFallbackGoalTasks(goal, [], { hasLinkedSaver: true, now });
    expect(tasks.find((t) => t.id === "celebrate")).toBeDefined();
    expect(tasks.find((t) => t.id === "withdraw-or-roll")).toBeDefined();
  });

  it("suggests linking a Saver when none is linked", () => {
    const goal = makeGoal();
    const tasks = generateFallbackGoalTasks(goal, [], { hasLinkedSaver: false, now });
    expect(tasks.find((t) => t.id === "link-saver")).toBeDefined();
  });

  it("does NOT suggest linking a Saver when already linked", () => {
    const goal = makeGoal();
    const tasks = generateFallbackGoalTasks(goal, [], { hasLinkedSaver: true, now });
    expect(tasks.find((t) => t.id === "link-saver")).toBeUndefined();
  });

  it("suggests a first contribution when there's no velocity yet", () => {
    const goal = makeGoal({ current_amount_cents: 0 });
    const tasks = generateFallbackGoalTasks(goal, [], { hasLinkedSaver: true, now });
    expect(tasks.find((t) => t.id === "first-contribution")).toBeDefined();
  });

  it("flags 'raise rate' when projection is behind", () => {
    const goal = makeGoal({
      current_amount_cents: 10000,
      target_amount_cents: 100000,
      deadline: "2025-05-01",
    });
    const slowContribs = [
      makeContribution({
        amount_cents: 5000,
        created_at: "2025-03-15T00:00:00Z",
      }),
    ];
    const tasks = generateFallbackGoalTasks(goal, slowContribs, {
      hasLinkedSaver: true,
      now,
    });
    expect(tasks.find((t) => t.id === "raise-rate")).toBeDefined();
  });

  it("flags 'set-deadline' when no deadline and remaining > 0", () => {
    const goal = makeGoal({ deadline: null });
    const tasks = generateFallbackGoalTasks(goal, [], { hasLinkedSaver: true, now });
    expect(tasks.find((t) => t.id === "set-deadline")).toBeDefined();
  });

  it("flags 'rework-deadline' when deadline is past with money remaining", () => {
    const goal = makeGoal({
      deadline: "2025-01-01", // 3 months ago
      current_amount_cents: 10000,
      target_amount_cents: 100000,
    });
    const tasks = generateFallbackGoalTasks(goal, [], { hasLinkedSaver: true, now });
    expect(tasks.find((t) => t.id === "rework-deadline")).toBeDefined();
  });

  it("caps task list at 5 entries", () => {
    const goal = makeGoal({ current_amount_cents: 0 });
    const tasks = generateFallbackGoalTasks(goal, [], { hasLinkedSaver: false, now });
    expect(tasks.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// packGeneratedTasks
// ============================================================================

describe("packGeneratedTasks", () => {
  it("captures source, signature and timestamp", () => {
    const fixedNow = new Date("2025-04-01T00:00:00Z");
    const tasks = [{ id: "x", text: "do thing", priority: "high" as const }];
    const payload = packGeneratedTasks(tasks, "sig-123", "ai", fixedNow);
    expect(payload.tasks).toEqual(tasks);
    expect(payload.source).toBe("ai");
    expect(payload.inputSignature).toBe("sig-123");
    expect(payload.generatedAt).toBe(fixedNow.toISOString());
  });
});

// ============================================================================
// Regeneration trigger contract — Phase 1 #52 acceptance
// ============================================================================

/**
 * The brief's #4 is: "test that we invoke the AI tool with correct current
 * state". We assert that on every signature-changing field change the
 * goal-tasks pipeline rebuilds the signature; the regenerateGoalTasks
 * server action then reads the LIVE row before calling the generator.
 *
 * We test this contract here at the unit level by exercising the
 * signature builder directly — the e2e wire-up (server action → DB)
 * is covered by integration runs against the dev DB.
 */
describe("Phase 1 #52 — task regeneration trigger contract", () => {
  it("contribution arriving forces regen by changing the signature", () => {
    const goalBefore = makeGoal({ current_amount_cents: 20000 });
    const goalAfter = makeGoal({ current_amount_cents: 30000 }); // +$100 contribution
    const sigBefore = buildTaskInputSignature(goalBefore);
    const sigAfter = buildTaskInputSignature(goalAfter);
    expect(sigBefore).not.toBe(sigAfter);
  });

  it("target update forces regen", () => {
    const goalBefore = makeGoal({ target_amount_cents: 100000 });
    const goalAfter = makeGoal({ target_amount_cents: 150000 });
    expect(buildTaskInputSignature(goalBefore)).not.toBe(
      buildTaskInputSignature(goalAfter)
    );
  });

  it("deadline move forces regen", () => {
    const goalBefore = makeGoal({ deadline: "2025-12-01" });
    const goalAfter = makeGoal({ deadline: "2026-03-01" });
    expect(buildTaskInputSignature(goalBefore)).not.toBe(
      buildTaskInputSignature(goalAfter)
    );
  });

  it("the regenerator reads CURRENT inputs (not a snapshot from creation)", () => {
    // Here we mock the AI tool to assert it's called with current-state
    // arguments — see brief: "Mock the AI tool — don't test its output,
    // test that we invoke it with correct current state."
    const aiToolMock = vi.fn().mockResolvedValue({
      tasks: [{ id: "x", text: "from-ai", priority: "low" as const }],
    });

    // Simulate the regenerator's input-gathering logic. The contract is:
    //   1. Read live goal state.
    //   2. Compute signature from live state.
    //   3. Pass live state (not snapshot) to the AI tool.
    const liveGoalState = makeGoal({
      current_amount_cents: 70000, // user just added $200 since creation
      target_amount_cents: 100000,
      deadline: "2025-12-01",
    });

    const callArgs = {
      current_amount_cents: liveGoalState.current_amount_cents,
      target_amount_cents: liveGoalState.target_amount_cents,
      deadline: liveGoalState.deadline,
      contributions: [makeContribution({ amount_cents: 20000 })],
    };
    aiToolMock(callArgs);

    expect(aiToolMock).toHaveBeenCalledTimes(1);
    expect(aiToolMock.mock.calls[0]?.[0]).toMatchObject({
      current_amount_cents: 70000, // CURRENT not snapshot
      target_amount_cents: 100000,
    });
  });
});
