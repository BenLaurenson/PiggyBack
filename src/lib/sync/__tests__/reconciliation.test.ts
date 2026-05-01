import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the reconciliation driver.
 *
 * The driver fans out across stale users, calling runSyncForUser once per
 * unique user. We mock both getStaleAccounts and runSyncForUser to focus
 * on the dispatch behaviour, not the sync internals.
 */

const getStaleAccountsMock = vi.fn();
const runSyncForUserMock = vi.fn();

vi.mock("@/lib/sync/state", () => ({
  getStaleAccounts: (...args: unknown[]) => getStaleAccountsMock(...args),
}));
vi.mock("@/lib/sync/runner", () => ({
  runSyncForUser: (...args: unknown[]) => runSyncForUserMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileStaleAccounts", () => {
  it("triggers one sync per unique user", async () => {
    getStaleAccountsMock.mockResolvedValue([
      { id: "a1", user_id: "user-A", sync_state: "STALE_PARTIAL", last_synced_at: null, sync_error_count: 1 },
      { id: "a2", user_id: "user-A", sync_state: "STALE_PARTIAL", last_synced_at: null, sync_error_count: 1 },
      { id: "a3", user_id: "user-B", sync_state: "STALE_PARTIAL", last_synced_at: null, sync_error_count: 1 },
    ]);
    runSyncForUserMock.mockResolvedValue({
      ok: true,
      partial: false,
      totalTxns: 5,
      errors: [],
      syncRunId: "run-1",
      failedAccounts: [],
      unauthorized: false,
    });

    const { reconcileStaleAccounts } = await import("../reconciliation");
    const r = await reconcileStaleAccounts(50);

    expect(getStaleAccountsMock).toHaveBeenCalledWith(50);
    expect(runSyncForUserMock).toHaveBeenCalledTimes(2);
    expect(runSyncForUserMock).toHaveBeenNthCalledWith(1, {
      userId: "user-A",
      trigger: "reconciliation_cron",
    });
    expect(runSyncForUserMock).toHaveBeenNthCalledWith(2, {
      userId: "user-B",
      trigger: "reconciliation_cron",
    });
    expect(r).toMatchObject({
      staleAccounts: 3,
      usersTriggered: 2,
      successes: 2,
      failures: 0,
    });
  });

  it("counts failures from runSyncForUser without throwing", async () => {
    getStaleAccountsMock.mockResolvedValue([
      { id: "a1", user_id: "user-X", sync_state: "STALE_PARTIAL", last_synced_at: null, sync_error_count: 1 },
    ]);
    runSyncForUserMock.mockResolvedValue({
      ok: false,
      partial: true,
      totalTxns: 0,
      errors: ["Up Bank token revoked"],
      syncRunId: "run-2",
      failedAccounts: ["acct"],
      unauthorized: true,
    });

    const { reconcileStaleAccounts } = await import("../reconciliation");
    const r = await reconcileStaleAccounts();

    expect(r.failures).toBe(1);
    expect(r.successes).toBe(0);
    expect(r.errors[0]).toEqual({
      userId: "user-X",
      error: "Up Bank token revoked",
    });
  });

  it("handles thrown errors from runSyncForUser", async () => {
    getStaleAccountsMock.mockResolvedValue([
      { id: "a1", user_id: "user-Y", sync_state: "STALE_PARTIAL", last_synced_at: null, sync_error_count: 1 },
    ]);
    runSyncForUserMock.mockRejectedValue(new Error("boom"));

    // Suppress console.error during this assertion.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { reconcileStaleAccounts } = await import("../reconciliation");
    const r = await reconcileStaleAccounts();

    expect(r.failures).toBe(1);
    expect(r.errors[0].userId).toBe("user-Y");
    expect(r.errors[0].error).toBe("boom");

    errSpy.mockRestore();
  });

  it("returns zeroed result when no stale accounts", async () => {
    getStaleAccountsMock.mockResolvedValue([]);
    const { reconcileStaleAccounts } = await import("../reconciliation");
    const r = await reconcileStaleAccounts();
    expect(runSyncForUserMock).not.toHaveBeenCalled();
    expect(r).toEqual({
      staleAccounts: 0,
      usersTriggered: 0,
      successes: 0,
      failures: 0,
      errors: [],
    });
  });
});
