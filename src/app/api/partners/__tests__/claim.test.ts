import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const resolveCallerMock = vi.fn();
vi.mock("@/lib/partners/auth", () => ({
  resolveOrchestratorCaller: () => resolveCallerMock(),
}));

const claimInvitationMock = vi.fn();
vi.mock("@/lib/partners/claim", () => ({
  claimInvitation: (args: unknown) => claimInvitationMock(args),
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

describe("POST /api/partners/claim", () => {
  it("requires sign-in", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Not signed in.",
    });
    const { POST } = await import("@/app/api/partners/claim/route");
    const res = await POST(makeReq({ token: "tok" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing token", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov-claimer", email: "sarah@example.com", userId: "u", googleSub: "g", displayName: null },
    });
    const { POST } = await import("@/app/api/partners/claim/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 with the lib error on a bad token", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov-claimer", email: "sarah@example.com", userId: "u", googleSub: "g", displayName: null },
    });
    claimInvitationMock.mockResolvedValueOnce({ ok: false, error: "Invitation expired. Ask for a new one." });
    const { POST } = await import("@/app/api/partners/claim/route");
    const res = await POST(makeReq({ token: "bad" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/expired/i);
    expect(fanoutMirrorMock).not.toHaveBeenCalled();
  });

  it("happy path: creates link + fans out webhooks + returns IDs", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov-claimer", email: "sarah@example.com", userId: "u", googleSub: "g", displayName: "Sarah" },
    });
    claimInvitationMock.mockResolvedValueOnce({
      ok: true,
      partnerLinkId: "link-1",
      inviterProvisionId: "prov-inviter",
      invitationId: "inv-1",
      invitedByPartnershipId: "ben-pship-1",
    });
    fanoutMirrorMock.mockResolvedValueOnce({
      results: [
        { provisionId: "prov-inviter", ok: true },
        { provisionId: "prov-claimer", ok: true },
      ],
    });
    const { POST } = await import("@/app/api/partners/claim/route");
    const res = await POST(makeReq({ token: "tok-abc" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      partner_link_id: string;
      inviter_provision_id: string;
      mirror_results: unknown;
    };
    expect(body.partner_link_id).toBe("link-1");
    expect(body.inviter_provision_id).toBe("prov-inviter");
    expect(claimInvitationMock).toHaveBeenCalledWith({
      token: "tok-abc",
      claimerProvisionId: "prov-claimer",
      claimerEmail: "sarah@example.com",
    });
    expect(fanoutMirrorMock).toHaveBeenCalledWith({
      event: "link_created",
      partnerLinkId: "link-1",
      inviterProvisionId: "prov-inviter",
      acceptorProvisionId: "prov-claimer",
      invitedByPartnershipId: "ben-pship-1",
    });
  });

  it("does not 500 if mirror webhook throws — returns 200 with empty results", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov-claimer", email: "sarah@example.com", userId: "u", googleSub: "g", displayName: "Sarah" },
    });
    claimInvitationMock.mockResolvedValueOnce({
      ok: true,
      partnerLinkId: "link-1",
      inviterProvisionId: "prov-inviter",
      invitationId: "inv-1",
      invitedByPartnershipId: "ben-pship-1",
    });
    fanoutMirrorMock.mockRejectedValueOnce(new Error("network down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/partners/claim/route");
    const res = await POST(makeReq({ token: "tok-abc" }));
    expect(res.status).toBe(200);
    errSpy.mockRestore();
  });
});
