/**
 * Tests for the provision-worker cron route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    advanceProvision: vi.fn(),
    rows: [
      { id: "p1", state: "STRIPE_PAID" },
      { id: "p2", state: "MIGRATIONS_RUNNING" },
    ] as Array<{ id: string; state: string }>,
  },
}));

vi.mock("@/lib/provisioner/worker", () => ({
  advanceProvision: mocks.advanceProvision,
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          or: () => ({
            limit: async () => ({ data: mocks.rows, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/role-context", () => ({
  assertOrchestrator: () => undefined,
  isOrchestrator: () => true,
}));

import { POST } from "./route";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/admin/provision-worker", {
    method: "POST",
    headers,
  });
}

describe("provision-worker route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    mocks.advanceProvision.mockReset();
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects unauthenticated requests", async () => {
    const res = await POST(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it("processes pickups in series", async () => {
    mocks.advanceProvision.mockImplementation(async (id: string) => ({
      id,
      from: "STRIPE_PAID",
      to: "AWAITING_SUPABASE_OAUTH",
    }));
    const res = await POST(
      makeReq({ authorization: "Bearer test-secret" }) as never
    );
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.results).toHaveLength(2);
    expect(mocks.advanceProvision).toHaveBeenCalledTimes(2);
  });

  it("captures advance errors per row instead of failing the batch", async () => {
    mocks.advanceProvision
      .mockImplementationOnce(async () => {
        throw new Error("network blip");
      })
      .mockImplementationOnce(async (id: string) => ({
        id,
        from: "MIGRATIONS_RUNNING",
        to: "VERCEL_CREATING",
      }));
    const res = await POST(
      makeReq({ authorization: "Bearer test-secret" }) as never
    );
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.results[0].error).toBe("network blip");
    expect(body.results[1].to).toBe("VERCEL_CREATING");
  });
});
