import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const resolveCallerMock = vi.fn();
vi.mock("@/lib/partners/auth", () => ({
  resolveOrchestratorCaller: () => resolveCallerMock(),
}));

const cancelInvitationMock = vi.fn();
vi.mock("@/lib/partners/invitations", () => ({
  cancelInvitation: (args: unknown) => cancelInvitationMock(args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

function makeReq(body: unknown): NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

describe("DELETE /api/partners/cancel", () => {
  it("requires sign-in", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Not signed in.",
    });
    const { DELETE } = await import("@/app/api/partners/cancel/route");
    const res = await DELETE(makeReq({ invitation_id: "i1" }));
    expect(res.status).toBe(401);
  });

  it("requires invitation_id", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    const { DELETE } = await import("@/app/api/partners/cancel/route");
    const res = await DELETE(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("scopes the cancel to the caller's provision", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    cancelInvitationMock.mockResolvedValueOnce({ ok: true });
    const { DELETE } = await import("@/app/api/partners/cancel/route");
    const res = await DELETE(makeReq({ invitation_id: "inv-1" }));
    expect(res.status).toBe(200);
    expect(cancelInvitationMock).toHaveBeenCalledWith({
      invitationId: "inv-1",
      invitedByProvisionId: "prov1",
    });
  });

  it("propagates errors as 500", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "prov1", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    cancelInvitationMock.mockResolvedValueOnce({ ok: false, error: "boom" });
    const { DELETE } = await import("@/app/api/partners/cancel/route");
    const res = await DELETE(makeReq({ invitation_id: "inv-1" }));
    expect(res.status).toBe(500);
  });
});
