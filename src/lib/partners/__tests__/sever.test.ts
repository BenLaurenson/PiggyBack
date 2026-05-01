import { describe, it, expect, vi, beforeEach } from "vitest";

interface ChainState {
  selectArg?: string;
  updates?: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
  resolveMaybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  resolveUpdate?: () => Promise<{ error: unknown }>;
}

function chainProxy(c: ChainState) {
  const obj: Record<string, unknown> = {
    select(arg: string) {
      c.selectArg = arg;
      return obj;
    },
    update(values: Record<string, unknown>) {
      c.updates = values;
      return {
        eq(col: string, val: unknown) {
          c.eqs.push([col, val]);
          return c.resolveUpdate?.() ?? Promise.resolve({ error: null });
        },
      };
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

describe("severPartnership", () => {
  it("returns 404 when link does not exist", async () => {
    const c: ChainState = {
      eqs: [],
      resolveMaybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    fromMock.mockImplementationOnce(() => chainProxy(c));
    const { severPartnership } = await import("@/lib/partners/sever");
    const result = await severPartnership({
      partnerLinkId: "nope",
      callerProvisionId: "prov1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("returns 403 when caller is not part of the link", async () => {
    const c: ChainState = {
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "ben",
            acceptor_provision_id: "sarah",
            status: "active",
          },
          error: null,
        }),
    };
    fromMock.mockImplementationOnce(() => chainProxy(c));
    const { severPartnership } = await import("@/lib/partners/sever");
    const result = await severPartnership({
      partnerLinkId: "l1",
      callerProvisionId: "stranger",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 409 when already severed", async () => {
    const c: ChainState = {
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "ben",
            acceptor_provision_id: "sarah",
            status: "severed",
          },
          error: null,
        }),
    };
    fromMock.mockImplementationOnce(() => chainProxy(c));
    const { severPartnership } = await import("@/lib/partners/sever");
    const result = await severPartnership({
      partnerLinkId: "l1",
      callerProvisionId: "ben",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
    }
  });

  it("happy path: marks severed + records caller as severed_by", async () => {
    const lookup: ChainState = {
      eqs: [],
      resolveMaybeSingle: () =>
        Promise.resolve({
          data: {
            id: "l1",
            initiator_provision_id: "ben",
            acceptor_provision_id: "sarah",
            status: "active",
          },
          error: null,
        }),
    };
    const update: ChainState = {
      eqs: [],
      resolveUpdate: () => Promise.resolve({ error: null }),
    };
    fromMock
      .mockImplementationOnce(() => chainProxy(lookup))
      .mockImplementationOnce(() => chainProxy(update));
    const { severPartnership } = await import("@/lib/partners/sever");
    const result = await severPartnership({
      partnerLinkId: "l1",
      callerProvisionId: "sarah",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inviterProvisionId).toBe("ben");
      expect(result.acceptorProvisionId).toBe("sarah");
    }
    expect(update.updates).toMatchObject({
      status: "severed",
      severed_by_provision_id: "sarah",
    });
    expect(update.updates?.severed_at).toBeTruthy();
  });
});
