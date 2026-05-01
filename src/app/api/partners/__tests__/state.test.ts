import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const resolveCallerMock = vi.fn();
vi.mock("@/lib/partners/auth", () => ({
  resolveOrchestratorCaller: () => resolveCallerMock(),
}));

const getPartnerStateMock = vi.fn();
const updateConsentsMock = vi.fn();
vi.mock("@/lib/partners/state", () => ({
  getPartnerState: (...a: unknown[]) => getPartnerStateMock(...a),
  updateConsents: (args: unknown) => updateConsentsMock(args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

function makeReq(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

describe("GET /api/partners/state", () => {
  it("requires sign-in", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Not signed in.",
    });
    const { GET } = await import("@/app/api/partners/state/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the partner state", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    getPartnerStateMock.mockResolvedValueOnce({
      link: null,
      pending_invitations: [],
    });
    const { GET } = await import("@/app/api/partners/state/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { link: unknown };
    expect(body.link).toBeNull();
    expect(getPartnerStateMock).toHaveBeenCalledWith("prov1");
  });
});

describe("PATCH /api/partners/state", () => {
  it("400s without partner_link_id", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    const { PATCH } = await import("@/app/api/partners/state/route");
    const res = await PATCH(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("forwards consent toggles", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    updateConsentsMock.mockResolvedValueOnce({ ok: true });
    const { PATCH } = await import("@/app/api/partners/state/route");
    const res = await PATCH(
      makeReq({
        partner_link_id: "l1",
        consent_aggregate_view: false,
        consent_transaction_view: true,
      })
    );
    expect(res.status).toBe(200);
    expect(updateConsentsMock).toHaveBeenCalledWith({
      partnerLinkId: "l1",
      callerProvisionId: "prov1",
      consentAggregateView: false,
      consentTransactionView: true,
    });
  });

  it("propagates lib status on failure", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    updateConsentsMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Not your partnership.",
    });
    const { PATCH } = await import("@/app/api/partners/state/route");
    const res = await PATCH(makeReq({ partner_link_id: "l1", consent_aggregate_view: true }));
    expect(res.status).toBe(403);
  });
});
