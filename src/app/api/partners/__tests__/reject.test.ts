import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const rejectMock = vi.fn();
vi.mock("@/lib/partners/claim", () => ({
  rejectInvitation: (token: string) => rejectMock(token),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

function makeReq(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

describe("POST /api/partners/reject", () => {
  it("400s when token missing", async () => {
    const { POST } = await import("@/app/api/partners/reject/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("calls rejectInvitation with the token", async () => {
    rejectMock.mockResolvedValueOnce({ ok: true });
    const { POST } = await import("@/app/api/partners/reject/route");
    const res = await POST(makeReq({ token: "tok-abc" }));
    expect(res.status).toBe(200);
    expect(rejectMock).toHaveBeenCalledWith("tok-abc");
  });

  it("500s on lib error", async () => {
    rejectMock.mockResolvedValueOnce({ ok: false, error: "boom" });
    const { POST } = await import("@/app/api/partners/reject/route");
    const res = await POST(makeReq({ token: "tok" }));
    expect(res.status).toBe(500);
  });
});
