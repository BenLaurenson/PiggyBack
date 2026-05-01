import { describe, it, expect, vi, beforeEach } from "vitest";

interface ChainState {
  selectArg?: string;
  ors: string[];
  eqs: Array<[string, unknown]>;
  resolveMaybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
}

function chainProxy(c: ChainState) {
  const obj: Record<string, unknown> = {
    select(arg: string) {
      c.selectArg = arg;
      return obj;
    },
    or(filter: string) {
      c.ors.push(filter);
      return obj;
    },
    eq(col: string, val: unknown) {
      c.eqs.push([col, val]);
      return obj;
    },
    maybeSingle() {
      return (
        c.resolveMaybeSingle?.() ??
        Promise.resolve({ data: null, error: null })
      );
    },
  };
  return obj;
}

const fromMock = vi.fn();
vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: fromMock }),
}));

const readOAuthMock = vi.fn();
vi.mock("@/lib/provisioner/state-machine", () => ({
  readOAuthToken: (...a: unknown[]) => readOAuthMock(...a),
}));

const runSqlMock = vi.fn();
const refreshTokenMock = vi.fn();
vi.mock("@/lib/provisioner/supabase-mgmt", () => ({
  runSql: (...a: unknown[]) => runSqlMock(...a),
  refreshSupabaseAccessToken: (...a: unknown[]) => refreshTokenMock(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
  vi.stubEnv("SUPABASE_OAUTH_CLIENT_ID", "cid");
  vi.stubEnv("SUPABASE_OAUTH_CLIENT_SECRET", "csec");
});

describe("monthKeyToRange", () => {
  it("parses YYYY-MM into a half-open UTC range", async () => {
    const { monthKeyToRange } = await import("@/lib/partners/fanout");
    expect(monthKeyToRange("2026-01")).toEqual({
      startIso: "2026-01-01T00:00:00.000Z",
      endIso: "2026-02-01T00:00:00.000Z",
    });
    expect(monthKeyToRange("2026-12")).toEqual({
      startIso: "2026-12-01T00:00:00.000Z",
      endIso: "2027-01-01T00:00:00.000Z",
    });
  });

  it("rejects malformed inputs", async () => {
    const { monthKeyToRange } = await import("@/lib/partners/fanout");
    expect(monthKeyToRange("2026-13")).toBeNull();
    expect(monthKeyToRange("2026-1")).toBeNull();
    expect(monthKeyToRange("not-a-month")).toBeNull();
  });
});

describe("parseAggregateRow", () => {
  it("coerces and clamps rows", async () => {
    const { parseAggregateRow } = await import("@/lib/partners/fanout");
    expect(
      parseAggregateRow({
        income_cents: "12345",
        expense_cents: 6789,
        top_categories: [
          { category: "Groceries", expense_cents: 2000 },
          { category: "Rent", expense_cents: "4500" },
          { category: 99, expense_cents: 100 },
        ],
      })
    ).toEqual({
      income_cents: 12345,
      expense_cents: 6789,
      top_categories: [
        { category: "Groceries", expense_cents: 2000 },
        { category: "Rent", expense_cents: 4500 },
        { category: "uncategorized", expense_cents: 100 },
      ],
    });
  });

  it("defaults missing fields to 0 / []", async () => {
    const { parseAggregateRow } = await import("@/lib/partners/fanout");
    expect(parseAggregateRow(null)).toEqual({
      income_cents: 0,
      expense_cents: 0,
      top_categories: [],
    });
  });
});

describe("fetchPartnerAggregates", () => {
  const baseArgs = {
    requesterProvisionId: "req",
    partnerProvisionId: "ptn",
    monthKey: "2026-04",
  };

  it("returns 403 when caller asks for their own data", async () => {
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates({
      requesterProvisionId: "x",
      partnerProvisionId: "x",
      monthKey: "2026-04",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("returns 403 when no active link exists", async () => {
    const linkChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    fromMock.mockImplementationOnce(() => chainProxy(linkChain));
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("returns hidden when consent_aggregate_view is false", async () => {
    const linkChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "req",
            acceptor_provision_id: "ptn",
            status: "active",
            consent_aggregate_view: false,
          },
          error: null,
        }),
    };
    fromMock.mockImplementationOnce(() => chainProxy(linkChain));
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates(baseArgs);
    expect(r.ok).toBe(true);
    if (r.ok && "hidden" in r) {
      expect(r.hidden).toBe(true);
    } else {
      throw new Error("expected hidden response");
    }
  });

  it("returns 503 when partner has no supabase_project_ref", async () => {
    const linkChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "req",
            acceptor_provision_id: "ptn",
            status: "active",
            consent_aggregate_view: true,
          },
          error: null,
        }),
    };
    const provChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: { id: "ptn", supabase_project_ref: null },
          error: null,
        }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(provChain));
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("returns 503 when token refresh fails", async () => {
    const linkChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "req",
            acceptor_provision_id: "ptn",
            status: "active",
            consent_aggregate_view: true,
          },
          error: null,
        }),
    };
    const provChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: { id: "ptn", supabase_project_ref: "ref-xyz" },
          error: null,
        }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(provChain));
    readOAuthMock.mockResolvedValueOnce({
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      externalConfigId: null,
    });
    refreshTokenMock.mockRejectedValueOnce(new Error("oauth dead"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
    errSpy.mockRestore();
  });

  it("happy path: aggregates rows from runSql", async () => {
    const linkChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "req",
            acceptor_provision_id: "ptn",
            status: "active",
            consent_aggregate_view: true,
          },
          error: null,
        }),
    };
    const provChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: { id: "ptn", supabase_project_ref: "ref-xyz" },
          error: null,
        }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(provChain));
    readOAuthMock.mockResolvedValueOnce({
      accessToken: "fresh",
      refreshToken: "rt",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      externalConfigId: null,
    });
    runSqlMock.mockResolvedValueOnce([
      {
        income_cents: 100000,
        expense_cents: 75000,
        top_categories: [
          { category: "Groceries", expense_cents: 25000 },
          { category: "Rent", expense_cents: 50000 },
        ],
      },
    ]);
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates(baseArgs);
    expect(r.ok).toBe(true);
    if (r.ok && "aggregates" in r) {
      expect(r.aggregates.income_cents).toBe(100000);
      expect(r.aggregates.expense_cents).toBe(75000);
      expect(r.aggregates.top_categories).toEqual([
        { category: "Groceries", expense_cents: 25000 },
        { category: "Rent", expense_cents: 50000 },
      ]);
    } else {
      throw new Error("expected aggregates");
    }
    // The runSql call received an access token + project ref + a SQL string
    // that scopes to the requested month.
    const [auth, ref, sql] = runSqlMock.mock.calls[0] as [
      { accessToken: string },
      string,
      string,
    ];
    expect(auth.accessToken).toBe("fresh");
    expect(ref).toBe("ref-xyz");
    expect(sql).toContain("2026-04-01T00:00:00.000Z");
    expect(sql).toContain("2026-05-01T00:00:00.000Z");
  });

  it("returns 503 when runSql throws", async () => {
    const linkChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "req",
            acceptor_provision_id: "ptn",
            status: "active",
            consent_aggregate_view: true,
          },
          error: null,
        }),
    };
    const provChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: { id: "ptn", supabase_project_ref: "ref-xyz" },
          error: null,
        }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(provChain));
    readOAuthMock.mockResolvedValueOnce({
      accessToken: "fresh",
      refreshToken: "rt",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      externalConfigId: null,
    });
    runSqlMock.mockRejectedValueOnce(new Error("network down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
    errSpy.mockRestore();
  });

  it("returns 403 when monthKey is malformed", async () => {
    const linkChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "req",
            acceptor_provision_id: "ptn",
            status: "active",
            consent_aggregate_view: true,
          },
          error: null,
        }),
    };
    const provChain: ChainState = {
      ors: [],
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: { id: "ptn", supabase_project_ref: "ref-xyz" },
          error: null,
        }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(provChain));
    const { fetchPartnerAggregates } = await import("@/lib/partners/fanout");
    const r = await fetchPartnerAggregates({
      ...baseArgs,
      monthKey: "junk",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});
