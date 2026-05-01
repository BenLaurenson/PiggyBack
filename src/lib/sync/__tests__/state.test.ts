import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the sync state machine helpers (src/lib/sync/state.ts).
 *
 * These helpers wrap supabase service-role updates to the accounts table
 * and to the sync_runs / sync_account_attempts audit tables. The helpers
 * are intentionally side-effecting and idempotent so they're safe to call
 * from the sync route, the reconciliation cron, and tests.
 */

const supabaseMock = {
  from: vi.fn(),
};

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => supabaseMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sync state machine helpers", () => {
  describe("markAccountSyncing", () => {
    it("sets sync_state='SYNCING' and sync_started_at on the account", async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      supabaseMock.from.mockReturnValue(chain);

      const { markAccountSyncing } = await import("../state");
      await markAccountSyncing("acct-1");

      expect(supabaseMock.from).toHaveBeenCalledWith("accounts");
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          sync_state: "SYNCING",
          sync_started_at: expect.any(String),
        })
      );
      expect(chain.eq).toHaveBeenCalledWith("id", "acct-1");
    });
  });

  describe("markAccountCurrent", () => {
    it("sets CURRENT, last_synced_at=now, resets sync_error_count and sync_last_error", async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      supabaseMock.from.mockReturnValue(chain);

      const { markAccountCurrent } = await import("../state");
      await markAccountCurrent("acct-2");

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          sync_state: "CURRENT",
          last_synced_at: expect.any(String),
          sync_error_count: 0,
          sync_last_error: null,
        })
      );
      expect(chain.eq).toHaveBeenCalledWith("id", "acct-2");
    });
  });

  describe("markAccountStalePartial", () => {
    it("sets STALE_PARTIAL, increments sync_error_count, records sync_last_error", async () => {
      // First call: read current count
      const readChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { sync_error_count: 2 },
          error: null,
        }),
      };
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      supabaseMock.from
        .mockReturnValueOnce(readChain)
        .mockReturnValueOnce(updateChain);

      const { markAccountStalePartial } = await import("../state");
      await markAccountStalePartial("acct-3", "2 windows skipped");

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          sync_state: "STALE_PARTIAL",
          sync_error_count: 3,
          sync_last_error: "2 windows skipped",
        })
      );
    });
  });

  describe("markAccountFailed", () => {
    it("sets SYNC_FAILED_PERMANENT and records sync_last_error", async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      supabaseMock.from.mockReturnValue(chain);

      const { markAccountFailed } = await import("../state");
      await markAccountFailed("acct-4", "persistent 5xx for 5 days");

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          sync_state: "SYNC_FAILED_PERMANENT",
          sync_last_error: "persistent 5xx for 5 days",
        })
      );
    });
  });

  describe("getStaleAccounts", () => {
    it("returns rows in STALE_PARTIAL or stale CURRENT, with error_count under cap", async () => {
      const fakeRows = [
        { id: "acct-stale", user_id: "u1", sync_state: "STALE_PARTIAL", sync_error_count: 2 },
      ];
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: fakeRows, error: null }),
      };
      supabaseMock.from.mockReturnValue(chain);

      const { getStaleAccounts } = await import("../state");
      const rows = await getStaleAccounts(50);

      expect(supabaseMock.from).toHaveBeenCalledWith("accounts");
      expect(chain.eq).toHaveBeenCalledWith("is_active", true);
      // Either an OR filter for sync_state, or a check on sync_error_count, must appear.
      expect(chain.or).toHaveBeenCalled();
      expect(chain.lt).toHaveBeenCalledWith("sync_error_count", 10);
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(rows).toEqual(fakeRows);
    });
  });
});

describe("sync run + attempt logging", () => {
  describe("startSyncRun", () => {
    it("inserts a row in sync_runs and returns the run id", async () => {
      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "run-123" },
          error: null,
        }),
      };
      supabaseMock.from.mockReturnValue(chain);

      const { startSyncRun } = await import("../state");
      const id = await startSyncRun("user-1", "manual");

      expect(supabaseMock.from).toHaveBeenCalledWith("sync_runs");
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          trigger: "manual",
        })
      );
      expect(id).toBe("run-123");
    });
  });

  describe("recordAccountAttempt", () => {
    it("inserts an attempt row with outcome + counters", async () => {
      const chain = {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
      supabaseMock.from.mockReturnValue(chain);

      const { recordAccountAttempt } = await import("../state");
      await recordAccountAttempt({
        syncRunId: "run-1",
        accountId: "acct-7",
        since: "2026-04-01T00:00:00Z",
        until: "2026-05-01T00:00:00Z",
        attemptNumber: 1,
        outcome: "success",
        windowsSkipped: 0,
        windowsTotal: 1,
        txnsInserted: 14,
        durationMs: 1234,
      });

      expect(supabaseMock.from).toHaveBeenCalledWith("sync_account_attempts");
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          sync_run_id: "run-1",
          account_id: "acct-7",
          outcome: "success",
          windows_skipped: 0,
          windows_total: 1,
          txns_inserted: 14,
          attempt_number: 1,
        })
      );
    });
  });

  describe("finishSyncRun", () => {
    it("updates the sync_runs row with summary + finished_at + duration_ms", async () => {
      // First call: read started_at to compute duration_ms.
      const readChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { started_at: new Date(Date.now() - 5000).toISOString() },
          error: null,
        }),
      };
      // Second call: update.
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      supabaseMock.from
        .mockReturnValueOnce(readChain)
        .mockReturnValueOnce(updateChain);

      const { finishSyncRun } = await import("../state");
      await finishSyncRun("run-99", {
        totalTxnsInserted: 100,
        totalTxnsUpdated: 5,
        accountsSucceeded: 2,
        accountsPartial: 1,
        accountsFailed: 0,
        errors: ["transient 502 on acct-x"],
      });

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          finished_at: expect.any(String),
          duration_ms: expect.any(Number),
          total_txns_inserted: 100,
          accounts_succeeded: 2,
          accounts_partial: 1,
          accounts_failed: 0,
        })
      );
      expect(updateChain.eq).toHaveBeenCalledWith("id", "run-99");
    });
  });
});
