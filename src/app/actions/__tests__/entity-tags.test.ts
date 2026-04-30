import { describe, it, expect, vi, beforeEach } from "vitest";

// ----------------------------------------------------------------------------
// Module mocks
// ----------------------------------------------------------------------------

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/demo-guard", () => ({
  demoActionGuard: vi.fn(() => null),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ----------------------------------------------------------------------------
// Mock supabase client builder
// ----------------------------------------------------------------------------

function createTagMockSupabase(opts?: {
  /** Tags returned by `entity_tags` SELECT (suggestTags / listTags). */
  entityTagRows?: Array<{ tag_name: string; entity_type: string; created_at?: string }>;
  /** Tags returned by `tags_canonical` SELECT (suggestTags). */
  canonicalRows?: Array<{ id: string }>;
  /** Force entity_tags upsert to error. */
  upsertError?: { message: string } | null;
  /** Force entity_tags delete to error. */
  deleteError?: { message: string } | null;
  user?: { id: string } | null;
}) {
  const upsertCalls: any[] = [];
  const deleteCalls: any[] = [];
  const insertCalls: any[] = [];

  const userValue = opts && "user" in opts ? opts.user : { id: "user-1" };
  const auth = {
    getUser: vi.fn(() => Promise.resolve({ data: { user: userValue } })),
  };

  function buildEntityTagsBuilder() {
    // Chainable for select(...).eq(...).eq(...).order(...).limit(...)
    const chain: any = {};
    const returnRows: any[] =
      opts?.entityTagRows?.map((r) => ({
        tag_name: r.tag_name,
        entity_type: r.entity_type,
      })) ?? [];

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve({ data: returnRows, error: null }));
    // also support being awaited directly
    chain.then = (resolve: any) => resolve({ data: returnRows, error: null });

    return {
      ...chain,
      upsert: vi.fn((row, _opts) => {
        upsertCalls.push({ row });
        return Promise.resolve({ error: opts?.upsertError ?? null });
      }),
      delete: vi.fn(() => {
        const deleteChain: any = {};
        deleteChain.eq = vi.fn(() => deleteChain);
        deleteChain.then = (resolve: any) =>
          resolve({ error: opts?.deleteError ?? null });
        deleteCalls.push(deleteChain);
        return deleteChain;
      }),
      insert: vi.fn((row) => {
        insertCalls.push({ row });
        return Promise.resolve({ error: null });
      }),
    };
  }

  function buildTagsBuilder() {
    return {
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    };
  }

  function buildCanonicalBuilder() {
    const chain: any = {};
    const rows = opts?.canonicalRows ?? [];
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve({ data: rows, error: null }));
    chain.then = (resolve: any) => resolve({ data: rows, error: null });
    return chain;
  }

  function buildLegacyTagsBuilder() {
    return {
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      delete: vi.fn(() => {
        const deleteChain: any = {};
        deleteChain.eq = vi.fn(() => deleteChain);
        deleteChain.then = (resolve: any) => resolve({ error: null });
        return deleteChain;
      }),
    };
  }

  return {
    auth,
    from: vi.fn((table: string) => {
      switch (table) {
        case "entity_tags":
          return buildEntityTagsBuilder();
        case "tags":
          return buildTagsBuilder();
        case "tags_canonical":
          return buildCanonicalBuilder();
        case "transaction_tags":
          return buildLegacyTagsBuilder();
        default:
          throw new Error(`Unexpected table in mock: ${table}`);
      }
    }),
    _upsertCalls: upsertCalls,
    _deleteCalls: deleteCalls,
  };
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

const VALID_GOAL_ID = "11111111-1111-4111-8111-111111111111";
const VALID_TXN_ID = "22222222-2222-4222-8222-222222222222";
const VALID_INV_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("entity-tags actions — addTag", () => {
  it("rejects an invalid entity type", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("nope" as any, VALID_GOAL_ID, "holiday");

    expect(result).toEqual({ error: "Invalid entity type" });
  });

  it("rejects an invalid uuid", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("goal", "not-a-uuid", "holiday");

    expect(result).toEqual({ error: "Invalid entity id" });
  });

  it("rejects an empty tag", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("goal", VALID_GOAL_ID, "   ");
    expect("error" in result).toBe(true);
  });

  it("rejects a tag longer than 50 chars", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("goal", VALID_GOAL_ID, "x".repeat(51));
    expect("error" in result).toBe(true);
  });

  it("returns Not authenticated when no user session", async () => {
    const supa = createTagMockSupabase({ user: null });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("goal", VALID_GOAL_ID, "holiday");
    expect(result).toEqual({ error: "Not authenticated" });
  });

  it("normalizes tag and writes to entity_tags for goals", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("goal", VALID_GOAL_ID, "  Holiday  ");

    expect(result).toEqual({ success: true, tag: "holiday" });
    // Confirm the upsert payload had the normalized tag, correct entity_type, and user_id.
    const goalUpsert = supa._upsertCalls.find(
      (c) => c.row.entity_type === "goal" && c.row.entity_id === VALID_GOAL_ID
    );
    expect(goalUpsert).toBeTruthy();
    expect(goalUpsert.row.tag_name).toBe("holiday");
    expect(goalUpsert.row.user_id).toBe("user-1");
  });

  it("mirrors transaction tags into the legacy transaction_tags table", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("transaction", VALID_TXN_ID, "groceries");

    expect(result).toEqual({ success: true, tag: "groceries" });
    // Both tables should have been called with `from()`.
    const fromCalls = (supa.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(fromCalls).toContain("entity_tags");
    expect(fromCalls).toContain("transaction_tags");
  });

  it("does NOT mirror to transaction_tags for goal/investment tags", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    await addTag("investment", VALID_INV_ID, "speculative");

    const fromCalls = (supa.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(fromCalls).toContain("entity_tags");
    expect(fromCalls).not.toContain("transaction_tags");
  });

  it("returns the safeError message when entity_tags upsert fails", async () => {
    const supa = createTagMockSupabase({
      upsertError: { message: "permission denied" },
    });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { addTag } = await import("@/app/actions/entity-tags");
    const result = await addTag("goal", VALID_GOAL_ID, "holiday");
    expect(result).toEqual({ error: "Failed to add tag" });
  });
});

describe("entity-tags actions — removeTag", () => {
  it("rejects invalid input before hitting the DB", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { removeTag } = await import("@/app/actions/entity-tags");
    const result = await removeTag("goal", "not-a-uuid", "tag");
    expect(result).toEqual({ error: "Invalid entity id" });
  });

  it("scopes the delete to the current user_id (RLS belt-and-braces)", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { removeTag } = await import("@/app/actions/entity-tags");
    const result = await removeTag("goal", VALID_GOAL_ID, "Holiday");

    expect(result).toEqual({ success: true });
    // Verify the delete chain was called with eq("user_id", "user-1") and eq("tag_name", "holiday")
    const delChain = supa._deleteCalls[0];
    expect(delChain).toBeTruthy();
    const eqCalls = delChain.eq.mock.calls;
    expect(eqCalls).toContainEqual(["entity_type", "goal"]);
    expect(eqCalls).toContainEqual(["entity_id", VALID_GOAL_ID]);
    expect(eqCalls).toContainEqual(["tag_name", "holiday"]);
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
  });

  it("mirrors transaction-tag deletion to the legacy table", async () => {
    const supa = createTagMockSupabase();
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { removeTag } = await import("@/app/actions/entity-tags");
    const result = await removeTag("transaction", VALID_TXN_ID, "groceries");
    expect(result).toEqual({ success: true });

    const fromCalls = (supa.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(fromCalls).toContain("transaction_tags");
  });

  it("returns the safeError message when the delete fails", async () => {
    const supa = createTagMockSupabase({
      deleteError: { message: "permission denied" },
    });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { removeTag } = await import("@/app/actions/entity-tags");
    const result = await removeTag("goal", VALID_GOAL_ID, "holiday");
    expect(result).toEqual({ error: "Failed to remove tag" });
  });
});

describe("entity-tags actions — suggestTags ranking", () => {
  it("ranks same-entity used tags above other-entity tags above canonical", async () => {
    const supa = createTagMockSupabase({
      entityTagRows: [
        // Used on a goal before — should rank highest for goal queries
        { tag_name: "holiday", entity_type: "goal" },
        // Used on a transaction — second tier
        { tag_name: "groceries", entity_type: "transaction" },
      ],
      canonicalRows: [
        // Discoverable but never used — third tier
        { id: "subscriptions" },
      ],
    });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { suggestTags } = await import("@/app/actions/entity-tags");
    const results = await suggestTags("goal", "");

    expect(results.length).toBe(3);
    expect(results[0].tag).toBe("holiday");
    expect(results[0].source).toBe("previous");
    expect(results[1].tag).toBe("groceries");
    expect(results[1].source).toBe("previous");
    expect(results[2].tag).toBe("subscriptions");
    expect(results[2].source).toBe("canonical");
    // Score order strictly decreasing
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  it("filters by query substring and applies prefix boost", async () => {
    const supa = createTagMockSupabase({
      entityTagRows: [
        { tag_name: "holiday", entity_type: "transaction" },
        { tag_name: "homewares", entity_type: "transaction" },
      ],
      canonicalRows: [
        { id: "house-deposit" }, // starts with "ho" — prefix boost
        { id: "echo" }, // contains "ho" only as a substring — no prefix boost
      ],
    });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { suggestTags } = await import("@/app/actions/entity-tags");
    const results = await suggestTags("goal", "ho");

    // All four tags include "ho" so all should be returned
    const tags = results.map((r) => r.tag);
    expect(tags).toContain("holiday");
    expect(tags).toContain("homewares");
    expect(tags).toContain("house-deposit");
    expect(tags).toContain("echo");

    // "echo" doesn't start with "ho" so it must rank below the prefix matches
    const echoIndex = tags.indexOf("echo");
    const holidayIndex = tags.indexOf("holiday");
    expect(echoIndex).toBeGreaterThan(holidayIndex);
  });

  it("deduplicates tags that appear in both used and canonical sources", async () => {
    const supa = createTagMockSupabase({
      entityTagRows: [{ tag_name: "holiday", entity_type: "goal" }],
      canonicalRows: [{ id: "holiday" }, { id: "groceries" }],
    });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { suggestTags } = await import("@/app/actions/entity-tags");
    const results = await suggestTags("goal", "");

    const holidayHits = results.filter((r) => r.tag === "holiday");
    expect(holidayHits.length).toBe(1);
    // The kept entry should be the higher-scored "previous" tier.
    expect(holidayHits[0].source).toBe("previous");
  });

  it("returns [] for unauthenticated users", async () => {
    const supa = createTagMockSupabase({ user: null });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { suggestTags } = await import("@/app/actions/entity-tags");
    const results = await suggestTags("goal", "");
    expect(results).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const supa = createTagMockSupabase({
      entityTagRows: [
        { tag_name: "a", entity_type: "goal" },
        { tag_name: "b", entity_type: "goal" },
        { tag_name: "c", entity_type: "goal" },
      ],
    });
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(supa);

    const { suggestTags } = await import("@/app/actions/entity-tags");
    const results = await suggestTags("goal", "", 2);
    expect(results.length).toBe(2);
  });
});
