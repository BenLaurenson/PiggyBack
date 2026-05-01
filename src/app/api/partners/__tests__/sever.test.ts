import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const resolveCallerMock = vi.fn();
vi.mock("@/lib/partners/auth", () => ({
  resolveOrchestratorCaller: () => resolveCallerMock(),
}));

const severMock = vi.fn();
vi.mock("@/lib/partners/sever", () => ({
  severPartnership: (args: unknown) => severMock(args),
}));

const fanoutMirrorMock = vi.fn();
vi.mock("@/lib/partners/mirror-webhooks", () => ({
  fanoutMirrorWebhook: (args: unknown) => fanoutMirrorMock(args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

function makeReq(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

describe("POST /api/partners/sever", () => {
  it("requires sign-in", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Not signed in.",
    });
    const { POST } = await import("@/app/api/partners/sever/route");
    const res = await POST(makeReq({ partner_link_id: "l1" }));
    expect(res.status).toBe(401);
  });

  it("requires partner_link_id", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    const { POST } = await import("@/app/api/partners/sever/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns the lib status on failure", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    severMock.mockResolvedValueOnce({ ok: false, status: 403, error: "Not your partnership." });
    const { POST } = await import("@/app/api/partners/sever/route");
    const res = await POST(makeReq({ partner_link_id: "l1" }));
    expect(res.status).toBe(403);
  });

  it("happy path: severs link + fans out webhooks", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    severMock.mockResolvedValueOnce({
      ok: true,
      inviterProvisionId: "prov1",
      acceptorProvisionId: "prov2",
    });
    fanoutMirrorMock.mockResolvedValueOnce({
      results: [
        { provisionId: "prov1", ok: true },
        { provisionId: "prov2", ok: true },
      ],
    });
    const { POST } = await import("@/app/api/partners/sever/route");
    const res = await POST(makeReq({ partner_link_id: "l1" }));
    expect(res.status).toBe(200);
    expect(severMock).toHaveBeenCalledWith({
      partnerLinkId: "l1",
      callerProvisionId: "prov1",
    });
    expect(fanoutMirrorMock).toHaveBeenCalledWith({
      event: "link_severed",
      partnerLinkId: "l1",
      inviterProvisionId: "prov1",
      acceptorProvisionId: "prov2",
      invitedByPartnershipId: null,
    });
  });
});
