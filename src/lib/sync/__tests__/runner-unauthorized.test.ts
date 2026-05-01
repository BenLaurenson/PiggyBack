import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 401-cascade test for runSyncForUser.
 *
 * When Up Bank returns 401 to any of the runner's API calls, the runner:
 *  1. flips ALL the user's accounts to STALE_PARTIAL
 *  2. disables the up_api_configs row (is_active=false)
 *  3. records errors and returns ok=false, unauthorized=true
 *
 * This test mocks the global fetch + the service-role supabase client so
 * we can verify the cascade SQL is dispatched correctly.
 */

type Chain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function buildChain(overrides: Partial<Record<keyof Chain, unknown>> = {}): Chain {
  const chain: Chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    in: vi.fn(() => chain),
    or: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };
  for (const [k, v] of Object.entries(overrides)) {
    (chain as Record<string, unknown>)[k] = v;
  }
  return chain;
}

const accountsUpdateChain = buildChain({
  update: vi.fn(() => accountsUpdateChain),
  eq: vi.fn(async () => ({ error: null })),
});
const upApiConfigsUpdateChain = buildChain({
  update: vi.fn(() => upApiConfigsUpdateChain),
  eq: vi.fn(async () => ({ error: null })),
});

const supabaseMock = {
  from: vi.fn(),
};

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => supabaseMock,
}));
vi.mock("@/lib/token-encryption", () => ({
  getPlaintextToken: () => "fake-up-token",
}));
vi.mock("@/lib/infer-category", () => ({
  inferCategoryId: () => null,
  ensureInferredCategories: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default fetch returns 401 (unauthorized).
  global.fetch = vi.fn(
    async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({ errors: [{ detail: "auth fail" }] }),
      }) as unknown as Response
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runSyncForUser - 401 cascade", () => {
  it("flips accounts to STALE_PARTIAL and disables up_api_configs on 401", async () => {
    // Sequence of `from()` calls the runner makes:
    //  1. up_api_configs select  (token lookup)
    //  2. sync_runs insert       (startSyncRun)
    //  3. ... fetch returns 401, throws UpUnauthorizedError
    //  4. accounts update (cascade)
    //  5. up_api_configs update (disable)
    //  6. sync_runs read started_at + update (finishSyncRun)
    //
    // We don't strictly need to enumerate them all — just assert the
    // cascade-relevant ones get the right args.

    const tokenLookupChain = buildChain({
      eq: vi.fn(() => tokenLookupChain),
      maybeSingle: vi.fn(async () => ({
        data: { encrypted_token: "encrypted", last_synced_at: null },
        error: null,
      })),
    });
    const syncRunsInsertChain = buildChain({
      insert: vi.fn(() => syncRunsInsertChain),
      select: vi.fn(() => syncRunsInsertChain),
      single: vi.fn(async () => ({ data: { id: "run-X" }, error: null })),
    });
    const accountsCascadeChain = buildChain({
      update: vi.fn(() => accountsCascadeChain),
      eq: vi.fn(async () => ({ error: null })),
    });
    const configsCascadeChain = buildChain({
      update: vi.fn(() => configsCascadeChain),
      eq: vi.fn(async () => ({ error: null })),
    });
    const syncRunsReadChain = buildChain({
      select: vi.fn(() => syncRunsReadChain),
      eq: vi.fn(() => syncRunsReadChain),
      single: vi.fn(async () => ({
        data: { started_at: new Date().toISOString() },
        error: null,
      })),
    });
    const syncRunsUpdateChain = buildChain({
      update: vi.fn(() => syncRunsUpdateChain),
      eq: vi.fn(async () => ({ error: null })),
    });

    // Plug in the sequence — order matches runner.ts execution.
    supabaseMock.from
      .mockReturnValueOnce(tokenLookupChain) //  1
      .mockReturnValueOnce(syncRunsInsertChain) //  2
      .mockReturnValueOnce(accountsCascadeChain) //  3 — cascade accounts
      .mockReturnValueOnce(configsCascadeChain) //  4 — cascade configs
      .mockReturnValueOnce(syncRunsReadChain) //  5 — finish: read
      .mockReturnValueOnce(syncRunsUpdateChain); //  6 — finish: update

    const { runSyncForUser } = await import("../runner");
    const result = await runSyncForUser({
      userId: "user-Z",
      trigger: "manual",
    });

    expect(result.unauthorized).toBe(true);
    expect(result.ok).toBe(false);

    // Cascade hit accounts.update with sync_state=STALE_PARTIAL.
    const accountsUpdateCalls = accountsCascadeChain.update.mock.calls;
    expect(accountsUpdateCalls.length).toBeGreaterThanOrEqual(1);
    expect(accountsUpdateCalls[0][0]).toMatchObject({
      sync_state: "STALE_PARTIAL",
      sync_last_error: expect.stringContaining("token revoked"),
    });
    expect(accountsCascadeChain.eq).toHaveBeenCalledWith("user_id", "user-Z");

    // Cascade hit up_api_configs.update with is_active=false.
    expect(configsCascadeChain.update.mock.calls[0][0]).toEqual({
      is_active: false,
    });
    expect(configsCascadeChain.eq).toHaveBeenCalledWith("user_id", "user-Z");
  });
});
