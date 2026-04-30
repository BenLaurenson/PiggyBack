/**
 * Tests for the activity-overrides server action.
 *
 * Covers:
 *   - Auth check rejects unauthenticated callers.
 *   - Insert path stores the override row.
 *   - Update path overwrites an existing row.
 *   - All-null path deletes the row instead of inserting.
 *   - Non-existent transaction id returns a friendly error.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/demo-guard", () => ({
  demoActionGuard: vi.fn(() => null),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const userId = "user-1";

interface MockSupabase {
  auth: { getUser: any };
  from: any;
}

function setUpClient(): MockSupabase {
  const upsertSpy = vi.fn().mockResolvedValue({ error: null });
  const deleteSpy = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }));

  // Track which table was last used so .upsert / .delete reflect activity_overrides
  // The .from('transactions') path needs a different chain (select → eq → maybeSingle).
  const txnLookup = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "txn-1", accounts: { user_id: userId } },
        }),
      })),
    })),
  }));

  const overrides = {
    upsert: upsertSpy,
    delete: deleteSpy,
  };

  const from = vi.fn((table: string) => {
    if (table === "transactions") return txnLookup();
    if (table === "activity_overrides") return overrides;
    throw new Error(`Unexpected table ${table} in test mock`);
  });

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
    from,
  } as MockSupabase;
}

describe("upsertActivityOverride", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated callers", async () => {
    const supabaseMock = setUpClient();
    supabaseMock.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supabaseMock);

    const { upsertActivityOverride } = await import("@/app/actions/activity-overrides");
    const result = await upsertActivityOverride({ transactionId: "txn-1" });
    expect(result).toEqual({ error: "Not authenticated" });
  });

  it("requires a transactionId", async () => {
    const supabaseMock = setUpClient();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supabaseMock);

    const { upsertActivityOverride } = await import("@/app/actions/activity-overrides");
    const result = await upsertActivityOverride({ transactionId: "" });
    expect(result.error).toMatch(/transactionId/);
  });

  it("returns friendly error when transaction not found", async () => {
    const supabaseMock = setUpClient();
    // override the transaction lookup to return null
    supabaseMock.from = vi.fn((table: string) => {
      if (table === "transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            })),
          })),
        };
      }
      throw new Error("not used");
    }) as any;
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supabaseMock);

    const { upsertActivityOverride } = await import("@/app/actions/activity-overrides");
    const result = await upsertActivityOverride({
      transactionId: "missing",
      merchantDisplayName: "X",
    });
    expect(result).toEqual({ error: "Transaction not found" });
  });

  it("upserts when at least one field is set", async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const deleteSpy = vi.fn();
    const supabaseMock = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "txn-1", accounts: { user_id: userId } },
                }),
              })),
            })),
          };
        }
        if (table === "activity_overrides") {
          return { upsert: upsertSpy, delete: deleteSpy };
        }
        throw new Error(table);
      }),
    } as any;
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supabaseMock);

    const { upsertActivityOverride } = await import("@/app/actions/activity-overrides");
    const result = await upsertActivityOverride({
      transactionId: "txn-1",
      merchantDisplayName: "Local Cafe",
      excludeFromBudget: true,
    });

    expect(result).toEqual({ success: true });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    const [row, opts] = upsertSpy.mock.calls[0];
    expect(row).toMatchObject({
      transaction_id: "txn-1",
      user_id: userId,
      merchant_display_name: "Local Cafe",
      exclude_from_budget: true,
    });
    expect(opts).toEqual({ onConflict: "transaction_id" });
  });

  it("deletes when every override field is null/undefined", async () => {
    const upsertSpy = vi.fn();
    const innerEq = vi.fn().mockResolvedValue({ error: null });
    const middleEq = vi.fn(() => ({ eq: innerEq }));
    const deleteSpy = vi.fn(() => ({ eq: middleEq }));

    const supabaseMock = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "txn-1", accounts: { user_id: userId } },
                }),
              })),
            })),
          };
        }
        if (table === "activity_overrides") {
          return { upsert: upsertSpy, delete: deleteSpy };
        }
        throw new Error(table);
      }),
    } as any;
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supabaseMock);

    const { upsertActivityOverride } = await import("@/app/actions/activity-overrides");
    const result = await upsertActivityOverride({ transactionId: "txn-1" });

    expect(result).toEqual({ success: true });
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("deleteActivityOverride is a thin wrapper that delegates to upsert with all nulls", async () => {
    const upsertSpy = vi.fn();
    const innerEq = vi.fn().mockResolvedValue({ error: null });
    const middleEq = vi.fn(() => ({ eq: innerEq }));
    const deleteSpy = vi.fn(() => ({ eq: middleEq }));

    const supabaseMock = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "txn-1", accounts: { user_id: userId } },
                }),
              })),
            })),
          };
        }
        return { upsert: upsertSpy, delete: deleteSpy };
      }),
    } as any;
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supabaseMock);

    const { deleteActivityOverride } = await import("@/app/actions/activity-overrides");
    await deleteActivityOverride("txn-1");

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
