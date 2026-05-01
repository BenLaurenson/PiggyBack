import { describe, it, expect, vi, beforeEach } from "vitest";

interface ChainState {
  selectArg?: string;
  ors: string[];
  ins: Array<[string, unknown[]]>;
  eqs: Array<[string, unknown]>;
  isClause: Array<[string, unknown]>;
  orderArgs?: [string, { ascending: boolean }];
  limitN?: number;
  updates?: Record<string, unknown>;
  resolveMaybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  resolveTerminal?: () =>
    | Promise<{ data: unknown; error: unknown }>
    | Promise<{ error: unknown }>;
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
    in(col: string, vals: unknown[]) {
      c.ins.push([col, vals]);
      return obj;
    },
    eq(col: string, val: unknown) {
      c.eqs.push([col, val]);
      return obj;
    },
    is(col: string, val: unknown) {
      c.isClause.push([col, val]);
      return obj;
    },
    order(col: string, opts: { ascending: boolean }) {
      c.orderArgs = [col, opts];
      // order is terminal in our usages — return a thenable
      return c.resolveTerminal?.() ?? Promise.resolve({ data: [], error: null });
    },
    limit(n: number) {
      c.limitN = n;
      return c.resolveTerminal?.() ?? Promise.resolve({ data: [], error: null });
    },
    update(values: Record<string, unknown>) {
      c.updates = values;
      return {
        eq(col: string, val: unknown) {
          c.eqs.push([col, val]);
          return c.resolveTerminal?.() ?? Promise.resolve({ error: null });
        },
      };
    },
    maybeSingle() {
      return (
        c.resolveMaybeSingle?.() ?? Promise.resolve({ data: null, error: null })
      );
    },
  };
  return obj;
}

const fromMock = vi.fn();
vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: fromMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

describe("getPartnerState", () => {
  it("returns null link + pending invitations when no partner_links match", async () => {
    const linkChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveTerminal: () => Promise.resolve({ data: [], error: null }),
    };
    const invChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveTerminal: () =>
        Promise.resolve({
          data: [
            {
              id: "i1",
              invitee_email: "sarah@example.com",
              manual_partner_name: "Sarah",
              expires_at: "2026-12-01T00:00:00Z",
            },
          ],
          error: null,
        }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(invChain));
    const { getPartnerState } = await import("@/lib/partners/state");
    const out = await getPartnerState("ben");
    expect(out.link).toBeNull();
    expect(out.pending_invitations).toHaveLength(1);
    expect(out.pending_invitations[0].invitee_email).toBe("sarah@example.com");
  });

  it("returns link with role=initiator when caller is the initiator", async () => {
    const linkChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveTerminal: () =>
        Promise.resolve({
          data: [
            {
              id: "l1",
              initiator_provision_id: "ben",
              acceptor_provision_id: "sarah",
              status: "active",
              active_at: "2026-04-01T00:00:00Z",
              consent_aggregate_view: true,
              consent_transaction_view: false,
            },
          ],
          error: null,
        }),
    };
    const partnerChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: { id: "sarah", email: "sarah@example.com", display_name: "Sarah" },
          error: null,
        }),
    };
    const invChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveTerminal: () => Promise.resolve({ data: [], error: null }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(partnerChain))
      .mockImplementationOnce(() => chainProxy(invChain));
    const { getPartnerState } = await import("@/lib/partners/state");
    const out = await getPartnerState("ben");
    expect(out.link?.role).toBe("initiator");
    expect(out.link?.partner_provision_id).toBe("sarah");
    expect(out.link?.partner_email).toBe("sarah@example.com");
    expect(out.link?.partner_display_name).toBe("Sarah");
    expect(out.link?.consent_aggregate_view).toBe(true);
    expect(out.link?.consent_transaction_view).toBe(false);
  });

  it("returns role=acceptor when caller is the acceptor", async () => {
    const linkChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveTerminal: () =>
        Promise.resolve({
          data: [
            {
              id: "l1",
              initiator_provision_id: "ben",
              acceptor_provision_id: "sarah",
              status: "active",
              active_at: null,
              consent_aggregate_view: false,
              consent_transaction_view: false,
            },
          ],
          error: null,
        }),
    };
    const partnerChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: { id: "ben", email: "ben@example.com", display_name: null },
          error: null,
        }),
    };
    const invChain: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveTerminal: () => Promise.resolve({ data: [], error: null }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(linkChain))
      .mockImplementationOnce(() => chainProxy(partnerChain))
      .mockImplementationOnce(() => chainProxy(invChain));
    const { getPartnerState } = await import("@/lib/partners/state");
    const out = await getPartnerState("sarah");
    expect(out.link?.role).toBe("acceptor");
    expect(out.link?.partner_provision_id).toBe("ben");
    expect(out.link?.partner_display_name).toBeNull();
  });
});

describe("updateConsents", () => {
  it("rejects when caller is not part of the link", async () => {
    const lookup: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "ben",
            acceptor_provision_id: "sarah",
          },
          error: null,
        }),
    };
    fromMock.mockImplementationOnce(() => chainProxy(lookup));
    const { updateConsents } = await import("@/lib/partners/state");
    const out = await updateConsents({
      partnerLinkId: "l1",
      callerProvisionId: "stranger",
      consentAggregateView: false,
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(403);
  });

  it("returns 404 when link missing", async () => {
    const lookup: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveMaybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    fromMock.mockImplementationOnce(() => chainProxy(lookup));
    const { updateConsents } = await import("@/lib/partners/state");
    const out = await updateConsents({
      partnerLinkId: "nope",
      callerProvisionId: "ben",
      consentAggregateView: false,
    });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(404);
  });

  it("happy path: updates only the supplied fields", async () => {
    const lookup: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "ben",
            acceptor_provision_id: "sarah",
          },
          error: null,
        }),
    };
    const update: ChainState = {
      ors: [],
      ins: [],
      eqs: [],
      isClause: [],
      resolveTerminal: () => Promise.resolve({ error: null }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(lookup))
      .mockImplementationOnce(() => chainProxy(update));
    const { updateConsents } = await import("@/lib/partners/state");
    const out = await updateConsents({
      partnerLinkId: "l1",
      callerProvisionId: "ben",
      consentTransactionView: true,
    });
    expect(out.ok).toBe(true);
    expect(update.updates).toEqual({ consent_transaction_view: true });
  });
});
