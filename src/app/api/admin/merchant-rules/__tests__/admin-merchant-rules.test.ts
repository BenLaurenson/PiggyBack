import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/merchant-default-rules", () => ({
  invalidateMerchantDefaultRulesCache: vi.fn(),
}));

const ADMIN_EMAIL = "admin@example.com";
const NON_ADMIN_EMAIL = "user@example.com";
const RULE_ID = "00000000-0000-4000-a000-000000000001";

function makeChain(resolved: { data: unknown; error: unknown; count?: number }) {
  const chain: any = {};
  const out = { ...resolved, then: undefined };
  for (const m of [
    "select",
    "insert",
    "upsert",
    "update",
    "delete",
    "eq",
    "in",
    "ilike",
    "neq",
    "order",
    "range",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(out));
  chain.maybeSingle = vi.fn(() => Promise.resolve(out));
  // Final await behaviour: chain itself resolves to result.
  chain.then = (cb: any) => Promise.resolve(out).then(cb);
  return chain;
}

describe("admin merchant-rules API", () => {
  let mockUserSupabase: any;
  let mockAdminSupabase: any;
  let chains: Record<string, any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;

    chains = {};

    mockUserSupabase = {
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: "user-1", email: ADMIN_EMAIL } },
          })
        ),
      },
    };

    mockAdminSupabase = {
      from: vi.fn((table: string) => {
        if (!chains[table]) chains[table] = makeChain({ data: null, error: null });
        return chains[table];
      }),
    };

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockUserSupabase);
    const { createServiceRoleClient } = await import(
      "@/utils/supabase/service-role"
    );
    (createServiceRoleClient as any).mockReturnValue(mockAdminSupabase);
  });

  it("rejects non-admin GET with 403", async () => {
    mockUserSupabase.auth.getUser = vi.fn(() =>
      Promise.resolve({
        data: { user: { id: "user-1", email: NON_ADMIN_EMAIL } },
      })
    );

    const { GET } = await import("@/app/api/admin/merchant-rules/route");
    const res = await GET(
      new Request("http://localhost/api/admin/merchant-rules")
    );
    expect(res!.status).toBe(403);
  });

  it("rejects unauthenticated GET with 401", async () => {
    mockUserSupabase.auth.getUser = vi.fn(() =>
      Promise.resolve({ data: { user: null } })
    );
    const { GET } = await import("@/app/api/admin/merchant-rules/route");
    const res = await GET(
      new Request("http://localhost/api/admin/merchant-rules")
    );
    expect(res!.status).toBe(401);
  });

  it("returns paginated rules to an admin", async () => {
    chains["merchant_default_rules"] = makeChain({
      data: [
        {
          id: RULE_ID,
          merchant_pattern: "ALDI",
          category_id: "groceries",
          parent_category_id: "home",
          source: "curated",
          suggested_by_user_id: null,
          notes: null,
          is_active: true,
          last_applied_at: null,
          applied_count: 0,
          created_at: "2026-04-30",
          updated_at: "2026-04-30",
        },
      ],
      error: null,
      count: 1,
    });

    const { GET } = await import("@/app/api/admin/merchant-rules/route");
    const res = await GET(
      new Request("http://localhost/api/admin/merchant-rules?page=1&pageSize=10")
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.rules).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(chains["merchant_default_rules"].order).toHaveBeenCalledWith(
      "merchant_pattern",
      { ascending: true }
    );
  });

  it("creates a new rule with source=curated", async () => {
    chains["merchant_default_rules"] = makeChain({
      data: { id: RULE_ID, merchant_pattern: "MYER" },
      error: null,
    });

    const { POST } = await import("@/app/api/admin/merchant-rules/route");
    const res = await POST(
      new Request("http://localhost/api/admin/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_pattern: "MYER",
          category_id: "clothing-and-accessories",
          parent_category_id: "personal",
        }),
      })
    );
    expect(res!.status).toBe(201);
    expect(chains["merchant_default_rules"].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant_pattern: "MYER",
        category_id: "clothing-and-accessories",
        source: "curated",
      })
    );
  });

  it("returns 409 on duplicate merchant_pattern", async () => {
    chains["merchant_default_rules"] = makeChain({
      data: null,
      error: { code: "23505" },
    });

    const { POST } = await import("@/app/api/admin/merchant-rules/route");
    const res = await POST(
      new Request("http://localhost/api/admin/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_pattern: "ALDI",
          category_id: "groceries",
        }),
      })
    );
    expect(res!.status).toBe(409);
  });

  it("validates payload schema (rejects empty pattern)", async () => {
    const { POST } = await import("@/app/api/admin/merchant-rules/route");
    const res = await POST(
      new Request("http://localhost/api/admin/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_pattern: "",
          category_id: "groceries",
        }),
      })
    );
    expect(res!.status).toBe(400);
  });

  it("PATCH updates rule and invalidates cache", async () => {
    chains["merchant_default_rules"] = makeChain({
      data: { id: RULE_ID, category_id: "takeaway" },
      error: null,
    });

    const { PATCH } = await import(
      "@/app/api/admin/merchant-rules/[id]/route"
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/merchant-rules/${RULE_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: "takeaway" }),
      }),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res!.status).toBe(200);

    const { invalidateMerchantDefaultRulesCache } = await import(
      "@/lib/merchant-default-rules"
    );
    expect(invalidateMerchantDefaultRulesCache).toHaveBeenCalled();
  });

  it("PATCH rejects empty body with 400", async () => {
    const { PATCH } = await import(
      "@/app/api/admin/merchant-rules/[id]/route"
    );
    const res = await PATCH(
      new Request(`http://localhost/api/admin/merchant-rules/${RULE_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res!.status).toBe(400);
  });

  it("DELETE removes rule and invalidates cache", async () => {
    chains["merchant_default_rules"] = makeChain({
      data: null,
      error: null,
    });
    const { DELETE } = await import(
      "@/app/api/admin/merchant-rules/[id]/route"
    );
    const res = await DELETE(
      new Request(`http://localhost/api/admin/merchant-rules/${RULE_ID}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: RULE_ID }) }
    );
    expect(res!.status).toBe(200);
    const { invalidateMerchantDefaultRulesCache } = await import(
      "@/lib/merchant-default-rules"
    );
    expect(invalidateMerchantDefaultRulesCache).toHaveBeenCalled();
  });
});
