import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const resolveCallerMock = vi.fn();
vi.mock("@/lib/partners/auth", () => ({
  resolveOrchestratorCaller: () => resolveCallerMock(),
}));

const fetchAggregatesMock = vi.fn();
vi.mock("@/lib/partners/fanout", () => ({
  fetchPartnerAggregates: (args: unknown) => fetchAggregatesMock(args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_HOSTED_ENABLED", "true");
});

function makeReq(qs: string): NextRequest {
  const url = new URL(`https://piggyback.finance/api/orchestrator/partner-aggregates?${qs}`);
  return { nextUrl: url } as unknown as NextRequest;
}

describe("GET /api/orchestrator/partner-aggregates", () => {
  it("requires sign-in", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Not signed in.",
    });
    const { GET } = await import(
      "@/app/api/orchestrator/partner-aggregates/route"
    );
    const res = await GET(makeReq("partner_provision_id=p&month=2026-04"));
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("400s without partner_provision_id", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "req", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    const { GET } = await import(
      "@/app/api/orchestrator/partner-aggregates/route"
    );
    const res = await GET(makeReq("month=2026-04"));
    expect(res.status).toBe(400);
  });

  it("returns hidden:true when consent off", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "req", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    fetchAggregatesMock.mockResolvedValueOnce({ ok: true, hidden: true });
    const { GET } = await import(
      "@/app/api/orchestrator/partner-aggregates/route"
    );
    const res = await GET(makeReq("partner_provision_id=p&month=2026-04"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hidden: boolean };
    expect(body.hidden).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("happy path: returns aggregates as JSON with no-store", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "req", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    fetchAggregatesMock.mockResolvedValueOnce({
      ok: true,
      aggregates: {
        income_cents: 100,
        expense_cents: 50,
        top_categories: [{ category: "X", expense_cents: 50 }],
      },
    });
    const { GET } = await import(
      "@/app/api/orchestrator/partner-aggregates/route"
    );
    const res = await GET(makeReq("partner_provision_id=p&month=2026-04"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      income_cents: number;
      partner_provision_id: string;
      month: string;
    };
    expect(body.income_cents).toBe(100);
    expect(body.partner_provision_id).toBe("p");
    expect(body.month).toBe("2026-04");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("propagates 403/503", async () => {
    resolveCallerMock.mockResolvedValueOnce({
      ok: true,
      caller: { provisionId: "req", email: "x@y.z", userId: "u", googleSub: "g", displayName: null },
    });
    fetchAggregatesMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: "Partner tenant unavailable.",
    });
    const { GET } = await import(
      "@/app/api/orchestrator/partner-aggregates/route"
    );
    const res = await GET(makeReq("partner_provision_id=p&month=2026-04"));
    expect(res.status).toBe(503);
  });
});
