/**
 * Integration tests for POST /api/account/subdomain — the vanity rename
 * endpoint. Mocks Supabase + Vercel + state-machine helpers.
 *
 * Cases:
 *   - rejects unauthenticated requests
 *   - rejects reserved name "admin"
 *   - rejects malformed name
 *   - rejects rename inside the 30-day cooldown
 *   - rejects when name is already taken by another tenant
 *   - happy path: writes alias row, updates provision row
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/provisioner/vercel-api", () => ({
  addProjectDomain: vi.fn(() => Promise.resolve({ name: "x", verified: true })),
  removeProjectDomain: vi.fn(() => Promise.resolve()),
  VercelApiError: class VercelApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/provisioner/state-machine", () => ({
  audit: vi.fn(() => Promise.resolve()),
  getProvisionByGoogleSub: vi.fn(),
  readOAuthToken: vi.fn(() =>
    Promise.resolve({
      accessToken: "vrcl_token",
      refreshToken: null,
      expiresAt: null,
      externalConfigId: null,
    })
  ),
}));

vi.mock("@/lib/log-scrubber", () => ({
  installLogScrubber: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ProvisionFixture {
  id: string;
  google_sub: string;
  subdomain_short_id: string;
  subdomain_vanity: string | null;
  vercel_project_id: string;
  vercel_team_id: string | null;
  subdomain_vanity_set_at?: string | null;
}

const PROVISION_BASE: ProvisionFixture = {
  id: "00000000-0000-4000-a000-000000000001",
  google_sub: "google-sub-1",
  subdomain_short_id: "j7k2p9",
  subdomain_vanity: null,
  vercel_project_id: "prj_test",
  vercel_team_id: null,
  subdomain_vanity_set_at: null,
};

function makeChain(resolved: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const out = { ...resolved };
  for (const m of [
    "select",
    "insert",
    "upsert",
    "update",
    "delete",
    "eq",
    "neq",
    "or",
    "lte",
    "gt",
    "limit",
    "order",
  ]) {
    (chain as Record<string, unknown>)[m] = vi.fn(() => chain);
  }
  (chain as Record<string, unknown>).single = vi.fn(() => Promise.resolve(out));
  (chain as Record<string, unknown>).maybeSingle = vi.fn(() => Promise.resolve(out));
  (chain as Record<string, unknown>).then = (cb: (v: unknown) => unknown) =>
    Promise.resolve(out).then(cb);
  return chain;
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/account/subdomain", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

async function loadRoute() {
  // Re-import after mocks/state are set up.
  return await import("../route");
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  const { createClient } = await import("@/utils/supabase/server");
  (createClient as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: "google-sub-1", email: "u@x.com" } } })
      ),
    },
  });
});

function setupServiceRoleMock(opts: {
  takenByOther?: boolean;
  aliasBlocking?: boolean;
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const provisionLookupChain = makeChain({
    data: opts.takenByOther ? { id: "other-id" } : null,
    error: null,
  });
  const aliasLookupChain = makeChain({
    data: opts.aliasBlocking
      ? {
          provision_id: "other-id",
          expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        }
      : null,
    error: null,
  });
  const aliasUpsertChain = makeChain({ data: null, error: opts.upsertError ?? null });
  const provisionUpdateChain = makeChain({ data: null, error: opts.updateError ?? null });
  const provisionRowChain = makeChain({
    data: { subdomain_vanity_set_at: null },
    error: null,
  });

  const tableCallSeq: string[] = [];
  const fromImpl = vi.fn((table: string) => {
    tableCallSeq.push(table);
    if (table === "subdomain_aliases") {
      // Cycle: first call is uniqueness lookup, second is upsert.
      const calls = tableCallSeq.filter((t) => t === "subdomain_aliases").length;
      return calls === 1 ? aliasLookupChain : aliasUpsertChain;
    }
    if (table === "piggyback_provisions") {
      const calls = tableCallSeq.filter((t) => t === "piggyback_provisions").length;
      // 1: getLastChangedAt -> select+maybeSingle -> provisionRowChain
      // 2: uniqueness check -> select+or+neq+maybeSingle -> provisionLookupChain
      // 3: update -> provisionUpdateChain
      if (calls === 1) return provisionRowChain;
      if (calls === 2) return provisionLookupChain;
      return provisionUpdateChain;
    }
    return makeChain({ data: null, error: null });
  });

  return {
    serviceRole: { from: fromImpl } as unknown,
    chains: { provisionLookupChain, aliasLookupChain, aliasUpsertChain, provisionUpdateChain },
  };
}

async function installProvision(provision: ProvisionFixture | null) {
  const sm = await import("@/lib/provisioner/state-machine");
  (sm.getProvisionByGoogleSub as unknown as { mockResolvedValue: (v: unknown) => void })
    .mockResolvedValue(provision);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/account/subdomain", () => {
  it("returns 401 if not signed in", async () => {
    const { createClient } = await import("@/utils/supabase/server");
    (createClient as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({
        auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null } })) },
      });
    const route = await loadRoute();
    const res = await route.POST(makeRequest({ vanity: "benl" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 404 if user has no provision row", async () => {
    await installProvision(null);
    const route = await loadRoute();
    const res = await route.POST(makeRequest({ vanity: "benl" }) as never);
    expect(res.status).toBe(404);
  });

  it("rejects reserved name 'admin' with 400", async () => {
    await installProvision({ ...PROVISION_BASE });
    const route = await loadRoute();
    const res = await route.POST(makeRequest({ vanity: "admin" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reserved/i);
  });

  it("rejects malformed name with 400", async () => {
    await installProvision({ ...PROVISION_BASE });
    const route = await loadRoute();
    const res = await route.POST(makeRequest({ vanity: "Bad_Name" }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects rename within the 30-day cooldown with 429", async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await installProvision({
      ...PROVISION_BASE,
      subdomain_vanity: "first-name",
      subdomain_vanity_set_at: fiveDaysAgo,
    });

    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const { serviceRole } = setupServiceRoleMock({});
    // Override the provision-row lookup to return a recent set_at.
    const recentChain = makeChain({
      data: { subdomain_vanity_set_at: fiveDaysAgo },
      error: null,
    });
    (serviceRole as { from: (t: string) => unknown }).from = vi.fn((table: string) => {
      if (table === "piggyback_provisions") return recentChain;
      return makeChain({ data: null, error: null });
    });
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void })
      .mockReturnValue(serviceRole);

    const route = await loadRoute();
    const res = await route.POST(makeRequest({ vanity: "second-name" }) as never);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/can change your subdomain again/i);
  });

  it("rejects when name is already taken by another tenant with 409", async () => {
    await installProvision({ ...PROVISION_BASE });
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const { serviceRole } = setupServiceRoleMock({ takenByOther: true });
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void })
      .mockReturnValue(serviceRole);

    const route = await loadRoute();
    const res = await route.POST(makeRequest({ vanity: "benl" }) as never);
    expect(res.status).toBe(409);
  });

  it("happy path: writes alias for old shortid and updates provision row", async () => {
    await installProvision({ ...PROVISION_BASE });
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const { serviceRole, chains } = setupServiceRoleMock({});
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void })
      .mockReturnValue(serviceRole);

    const route = await loadRoute();
    const res = await route.POST(makeRequest({ vanity: "benl" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.vanity).toBe("benl");
    expect(body.aliasFor).toBe("j7k2p9");
    expect(typeof body.aliasExpiresAt).toBe("string");

    // Assert we tried to upsert the alias for the old shortid and update the
    // provision row to the new vanity.
    expect(chains.aliasUpsertChain.upsert).toHaveBeenCalled();
    const upsertArg = (chains.aliasUpsertChain.upsert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertArg.alias).toBe("j7k2p9");
    expect(upsertArg.kind).toBe("shortid");

    expect(chains.provisionUpdateChain.update).toHaveBeenCalled();
    const updateArg = (chains.provisionUpdateChain.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateArg.subdomain_vanity).toBe("benl");
    expect(typeof updateArg.subdomain_vanity_set_at).toBe("string");
  });

  it("calls Vercel addProjectDomain with the new hostname", async () => {
    await installProvision({ ...PROVISION_BASE });
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    const { serviceRole } = setupServiceRoleMock({});
    (createServiceRoleClient as unknown as { mockReturnValue: (v: unknown) => void })
      .mockReturnValue(serviceRole);

    const vercel = await import("@/lib/provisioner/vercel-api");
    const route = await loadRoute();
    await route.POST(makeRequest({ vanity: "benl" }) as never);

    expect(vercel.addProjectDomain).toHaveBeenCalled();
    const calls = (vercel.addProjectDomain as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const newHostnameAttached = calls.some(
      (call) => call[2] === "benl.piggyback.finance" && call[1] === "prj_test"
    );
    expect(newHostnameAttached).toBe(true);
  });
});
