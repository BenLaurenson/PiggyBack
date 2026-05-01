/**
 * Tests for the admin provisions API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    rows: [
      {
        id: "p1",
        state: "FAILED_RETRYABLE",
        state_data: { last_failure_state: "MIGRATIONS_RUNNING" },
      },
    ] as Array<Record<string, unknown>>,
    audit: vi.fn(async () => undefined),
    updateCalls: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/lib/provisioner/state-machine", () => ({
  audit: mocks.audit,
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.rows[0] }),
        }),
        order: () => ({
          range: async () => ({ data: mocks.rows, count: mocks.rows.length, error: null }),
        }),
      }),
      update: (fields: Record<string, unknown>) => {
        mocks.updateCalls.push(fields);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { GET, POST } from "./route";

function makeReq(body: unknown, headers: Record<string, string> = {}, url = "https://x/api/admin/provisions") {
  return new Request(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin provisions API", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.ADMIN_EMAILS = "admin@x.io";
    mocks.audit.mockReset();
    mocks.updateCalls.length = 0;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.ADMIN_EMAILS;
  });

  it("GET unauthorized without admin", async () => {
    const res = await GET(makeReq(null) as never);
    expect(res.status).toBe(401);
  });

  it("GET with bearer secret returns rows", async () => {
    const res = await GET(makeReq(null, { authorization: "Bearer test-secret" }) as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows).toHaveLength(1);
  });

  it("POST retry resumes from last_failure_state", async () => {
    const res = await POST(
      makeReq({ id: "p1", action: "retry" }, { authorization: "Bearer test-secret" }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resumeTo).toBe("MIGRATIONS_RUNNING");
    expect(mocks.updateCalls[0]).toMatchObject({ state: "MIGRATIONS_RUNNING" });
    expect(mocks.audit).toHaveBeenCalledWith("p1", "ADMIN_RETRY", expect.any(Object));
  });

  it("POST cancel sets state CANCELLED", async () => {
    const res = await POST(
      makeReq({ id: "p1", action: "cancel" }, { authorization: "Bearer test-secret" }) as never
    );
    expect(res.status).toBe(200);
    expect(mocks.updateCalls[0]).toMatchObject({ state: "CANCELLED" });
  });

  it("POST validates required fields", async () => {
    const res = await POST(
      makeReq({}, { authorization: "Bearer test-secret" }) as never
    );
    expect(res.status).toBe(400);
  });
});
