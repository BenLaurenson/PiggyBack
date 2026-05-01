import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const resolveCallerMock = vi.fn();
vi.mock("@/lib/partners/auth", () => ({
  resolveOrchestratorCaller: () => resolveCallerMock(),
}));

const createInvitationMock = vi.fn();
vi.mock("@/lib/partners/invitations", () => ({
  createInvitation: (args: unknown) => createInvitationMock(args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    json: () => Promise.resolve(body),
    headers: {
      get(key: string) {
        return headers[key.toLowerCase()] ?? null;
      },
    },
  } as unknown as NextRequest;
}

describe("POST /api/partners/invite", () => {
  it("returns 401 when caller is not signed in", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Not signed in.",
    });
    const { POST } = await import("@/app/api/partners/invite/route");
    const res = await POST(
      makeReq({ partnership_id: "p1", invitee_email: "a@b.c" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when partnership_id missing", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: {
        userId: "u1",
        provisionId: "prov1",
        email: "ben@example.com",
        googleSub: "g",
        displayName: "Ben",
      },
    });
    const { POST } = await import("@/app/api/partners/invite/route");
    const res = await POST(makeReq({ invitee_email: "a@b.c" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with invitation_id + token on happy path", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: {
        userId: "u1",
        provisionId: "prov1",
        email: "ben@example.com",
        googleSub: "g",
        displayName: "Ben",
      },
    });
    createInvitationMock.mockResolvedValueOnce({
      ok: true,
      invitationId: "inv-1",
      token: "tok",
    });
    const { POST } = await import("@/app/api/partners/invite/route");
    const res = await POST(
      makeReq({
        partnership_id: "p1",
        invitee_email: "sarah@example.com",
        manual_partner_name: "Sarah",
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invitation_id: string; token: string };
    expect(body).toEqual({ invitation_id: "inv-1", token: "tok" });
    expect(createInvitationMock).toHaveBeenCalledWith({
      invitedByProvisionId: "prov1",
      invitedByPartnershipId: "p1",
      inviteeEmail: "sarah@example.com",
      manualPartnerName: "Sarah",
      inviterDisplayName: "Ben",
    });
  });

  it("falls back to caller email for inviterDisplayName when displayName null", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: {
        userId: "u1",
        provisionId: "prov1",
        email: "ben@example.com",
        googleSub: "g",
        displayName: null,
      },
    });
    createInvitationMock.mockResolvedValueOnce({
      ok: true,
      invitationId: "inv-1",
      token: "tok",
    });
    const { POST } = await import("@/app/api/partners/invite/route");
    await POST(
      makeReq({ partnership_id: "p1", invitee_email: "sarah@example.com" })
    );
    expect(createInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({ inviterDisplayName: "ben@example.com" })
    );
  });

  it("returns 400 when createInvitation rejects (e.g. invalid email)", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: {
        userId: "u1",
        provisionId: "prov1",
        email: "ben@example.com",
        googleSub: "g",
        displayName: "Ben",
      },
    });
    createInvitationMock.mockResolvedValueOnce({
      ok: false,
      error: "Invalid email address",
    });
    const { POST } = await import("@/app/api/partners/invite/route");
    const res = await POST(
      makeReq({ partnership_id: "p1", invitee_email: "nope" })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid email address");
  });
});
