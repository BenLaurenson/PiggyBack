import { describe, it, expect, vi, beforeEach } from "vitest";

// Builds a per-test mock supabase client where each `from(table)` call returns
// a chainable that we can program. We track invocations via the `lastChain`
// holder so individual tests can configure what `select`/`update`/`insert`
// resolve with.

type Resolver<T = unknown> = () => Promise<T>;

interface ChainState {
  selectArg?: string;
  inserted?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
  isClause?: [string, unknown];
  resolveSingle?: Resolver<{ data: unknown; error: unknown }>;
  resolveMaybeSingle?: Resolver<{ data: unknown; error: unknown }>;
  resolveUpdate?: Resolver<{ error: unknown }>;
}

const chainsByTable: Record<string, ChainState[]> = {};

function makeChain(table: string): ChainState {
  const c: ChainState = { eqs: [] };
  chainsByTable[table] = chainsByTable[table] ?? [];
  chainsByTable[table].push(c);
  return c;
}

function chainProxy(c: ChainState, table: string) {
  // The chain object exposes the full set of methods we use, returning itself
  // for chainable methods and resolving for terminal methods.
  const obj: Record<string, unknown> = {
    select(arg: string) {
      c.selectArg = arg;
      return obj;
    },
    insert(values: Record<string, unknown>) {
      c.inserted = values;
      return obj;
    },
    update(values: Record<string, unknown>) {
      c.updates = values;
      // update() chain resolves on the terminal eq() call; expose it as a
      // thenable so we can `await supabase.from(...).update().eq().eq()`.
      return {
        eq(col: string, val: unknown) {
          c.eqs.push([col, val]);
          return {
            eq(col2: string, val2: unknown) {
              c.eqs.push([col2, val2]);
              return c.resolveUpdate?.() ?? Promise.resolve({ error: null });
            },
            is(col2: string, val2: unknown) {
              c.isClause = [col2, val2];
              return c.resolveUpdate?.() ?? Promise.resolve({ error: null });
            },
            then(onFulfilled: (v: { error: unknown }) => unknown) {
              return (
                c.resolveUpdate?.() ?? Promise.resolve({ error: null })
              ).then(onFulfilled);
            },
          };
        },
      };
    },
    eq(col: string, val: unknown) {
      c.eqs.push([col, val]);
      return obj;
    },
    is(col: string, val: unknown) {
      c.isClause = [col, val];
      return obj;
    },
    maybeSingle() {
      return (
        c.resolveMaybeSingle?.() ??
        Promise.resolve({ data: null, error: null })
      );
    },
    single() {
      return (
        c.resolveSingle?.() ?? Promise.resolve({ data: null, error: null })
      );
    },
  };
  // Track which table this chain serves (helpful when debugging tests).
  void table;
  return obj;
}

const fromMock = vi.fn((table: string) => {
  const c = makeChain(table);
  return chainProxy(c, table);
});

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: fromMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(chainsByTable)) {
    delete chainsByTable[k];
  }
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

function programInvitationLookup(data: unknown, error: unknown = null) {
  // The first `from('partner_claim_invitations')` chain handles the SELECT
  // lookup. We pre-create that chain and program its maybeSingle() resolver.
  const c = makeChain("partner_claim_invitations");
  c.resolveMaybeSingle = () =>
    Promise.resolve({ data, error });
  // Subsequent calls to from('partner_claim_invitations') will create new
  // chains; this only programs the lookup chain.
  // Re-route fromMock so the first lookup uses *this* chain rather than
  // making a fresh one.
  // Simplest approach: pre-pop the chains list so fromMock returns this one.
  // We achieve that by leaving it in chainsByTable; fromMock pushes new ones,
  // but tests below count them via the first entry.
  return c;
}

describe("claimInvitation", () => {
  const baseArgs = {
    token: "tok-abc",
    claimerProvisionId: "claimer-prov",
    claimerEmail: "sarah@example.com",
  };

  it("returns 'not found' when the token has no row", async () => {
    // Override fromMock to return a chain that resolves to null data.
    const lookup = chainProxy({ eqs: [], resolveMaybeSingle: () => Promise.resolve({ data: null, error: null }) }, "partner_claim_invitations");
    fromMock.mockImplementationOnce(() => lookup);
    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation(baseArgs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
  });

  it("returns 'already used' when the invitation has been claimed", async () => {
    const lookup = chainProxy(
      {
        eqs: [],
        resolveMaybeSingle: () =>
          Promise.resolve({
            data: {
              id: "inv1",
              invitee_email: "sarah@example.com",
              invited_by_provision_id: "inv-prov",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              claimed_at: new Date().toISOString(),
              rejected_at: null,
            },
            error: null,
          }),
      },
      "partner_claim_invitations"
    );
    fromMock.mockImplementationOnce(() => lookup);
    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation(baseArgs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already used/i);
  });

  it("returns 'declined' when the invitation has been rejected", async () => {
    const lookup = chainProxy(
      {
        eqs: [],
        resolveMaybeSingle: () =>
          Promise.resolve({
            data: {
              id: "inv1",
              invitee_email: "sarah@example.com",
              invited_by_provision_id: "inv-prov",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              claimed_at: null,
              rejected_at: new Date().toISOString(),
            },
            error: null,
          }),
      },
      "partner_claim_invitations"
    );
    fromMock.mockImplementationOnce(() => lookup);
    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation(baseArgs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/declined/i);
  });

  it("returns 'expired' when expires_at is in the past", async () => {
    const lookup = chainProxy(
      {
        eqs: [],
        resolveMaybeSingle: () =>
          Promise.resolve({
            data: {
              id: "inv1",
              invitee_email: "sarah@example.com",
              invited_by_provision_id: "inv-prov",
              expires_at: new Date(Date.now() - 86_400_000).toISOString(),
              claimed_at: null,
              rejected_at: null,
            },
            error: null,
          }),
      },
      "partner_claim_invitations"
    );
    fromMock.mockImplementationOnce(() => lookup);
    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation(baseArgs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expired/i);
  });

  it("rejects email mismatch", async () => {
    const lookup = chainProxy(
      {
        eqs: [],
        resolveMaybeSingle: () =>
          Promise.resolve({
            data: {
              id: "inv1",
              invitee_email: "different@example.com",
              invited_by_provision_id: "inv-prov",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              claimed_at: null,
              rejected_at: null,
            },
            error: null,
          }),
      },
      "partner_claim_invitations"
    );
    fromMock.mockImplementationOnce(() => lookup);
    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation(baseArgs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/different@example\.com/);
  });

  it("rejects self-claim (inviter == claimer)", async () => {
    const lookup = chainProxy(
      {
        eqs: [],
        resolveMaybeSingle: () =>
          Promise.resolve({
            data: {
              id: "inv1",
              invitee_email: "sarah@example.com",
              invited_by_provision_id: "claimer-prov",
              expires_at: new Date(Date.now() + 86_400_000).toISOString(),
              claimed_at: null,
              rejected_at: null,
            },
            error: null,
          }),
      },
      "partner_claim_invitations"
    );
    fromMock.mockImplementationOnce(() => lookup);
    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation(baseArgs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/own invitation/i);
  });

  it("happy path: creates partner_links + marks claimed_at", async () => {
    const inviteRow = {
      id: "inv1",
      invitee_email: "Sarah@Example.com",
      invited_by_provision_id: "inv-prov",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      claimed_at: null,
      rejected_at: null,
    };
    const lookup = chainProxy(
      {
        eqs: [],
        resolveMaybeSingle: () =>
          Promise.resolve({ data: inviteRow, error: null }),
      },
      "partner_claim_invitations"
    );
    const linkInsert: ChainState = {
      eqs: [],
      resolveSingle: () =>
        Promise.resolve({ data: { id: "link-1" }, error: null }),
    };
    const linkChain = chainProxy(linkInsert, "partner_links");
    const claimUpdate: ChainState = {
      eqs: [],
      resolveUpdate: () => Promise.resolve({ error: null }),
    };
    const claimChain = chainProxy(claimUpdate, "partner_claim_invitations");

    fromMock
      .mockImplementationOnce(() => lookup) // SELECT invitation
      .mockImplementationOnce(() => linkChain) // INSERT partner_links
      .mockImplementationOnce(() => claimChain); // UPDATE invitation claimed_at

    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation({
      ...baseArgs,
      // Claimer email differs in case from the invitee_email — match should
      // still succeed (case-insensitive comparison).
      claimerEmail: "SARAH@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.partnerLinkId).toBe("link-1");
      expect(result.inviterProvisionId).toBe("inv-prov");
    }
    expect(linkInsert.inserted).toMatchObject({
      initiator_provision_id: "inv-prov",
      acceptor_provision_id: "claimer-prov",
      status: "active",
    });
    expect(linkInsert.inserted?.active_at).toBeTruthy();
    expect(claimUpdate.updates).toMatchObject({
      claimed_provision_id: "claimer-prov",
    });
    expect(claimUpdate.updates?.claimed_at).toBeTruthy();
    // claim update was scoped to the invitation row by id
    expect(claimUpdate.eqs).toEqual([["id", "inv1"]]);
  });

  it("returns the link error if partner_links insert fails", async () => {
    const inviteRow = {
      id: "inv1",
      invitee_email: "sarah@example.com",
      invited_by_provision_id: "inv-prov",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      claimed_at: null,
      rejected_at: null,
    };
    const lookup = chainProxy(
      {
        eqs: [],
        resolveMaybeSingle: () =>
          Promise.resolve({ data: inviteRow, error: null }),
      },
      "partner_claim_invitations"
    );
    const linkInsert: ChainState = {
      eqs: [],
      resolveSingle: () =>
        Promise.resolve({ data: null, error: { message: "duplicate pair" } }),
    };
    const linkChain = chainProxy(linkInsert, "partner_links");
    fromMock
      .mockImplementationOnce(() => lookup)
      .mockImplementationOnce(() => linkChain);

    const { claimInvitation } = await import("@/lib/partners/claim");
    const result = await claimInvitation({
      ...baseArgs,
      claimerEmail: "sarah@example.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("duplicate pair");
  });
});

describe("rejectInvitation", () => {
  it("marks rejected_at and only when not yet claimed", async () => {
    const update: ChainState = {
      eqs: [],
      resolveUpdate: () => Promise.resolve({ error: null }),
    };
    const chain = chainProxy(update, "partner_claim_invitations");
    fromMock.mockImplementationOnce(() => chain);
    const { rejectInvitation } = await import("@/lib/partners/claim");
    const result = await rejectInvitation("tok-abc");
    expect(result.ok).toBe(true);
    expect(update.updates?.rejected_at).toBeTruthy();
    expect(update.eqs).toEqual([["token", "tok-abc"]]);
    expect(update.isClause).toEqual(["claimed_at", null]);
  });

  it("propagates DB errors", async () => {
    const update: ChainState = {
      eqs: [],
      resolveUpdate: () => Promise.resolve({ error: { message: "boom" } }),
    };
    const chain = chainProxy(update, "partner_claim_invitations");
    fromMock.mockImplementationOnce(() => chain);
    const { rejectInvitation } = await import("@/lib/partners/claim");
    const result = await rejectInvitation("tok-abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("boom");
  });
});
