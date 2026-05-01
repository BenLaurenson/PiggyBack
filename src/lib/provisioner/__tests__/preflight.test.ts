/**
 * Tests for preflightCheck.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    rows: new Map<string, Record<string, unknown>>(),
    readyForSub: null as Record<string, unknown> | null,
    dailyUsage: 0,
  },
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: (field: string, value: unknown) => {
          if (field === "id") {
            return {
              maybeSingle: async () => ({ data: mocks.rows.get(value as string) ?? null }),
            };
          }
          // chained google_sub + state lookup
          return {
            eq: () => ({
              neq: () => ({
                maybeSingle: async () => ({ data: mocks.readyForSub }),
              }),
            }),
          };
        },
      }),
    }),
  }),
}));

vi.mock("../resource-usage", () => ({
  getDailyUsage: async () => mocks.dailyUsage,
}));

import { preflightCheck } from "../preflight";

describe("preflightCheck", () => {
  beforeEach(() => {
    mocks.rows.clear();
    mocks.readyForSub = null;
    mocks.dailyUsage = 0;
    delete process.env.SUPABASE_MGMT_DAILY_QUOTA;
  });

  it("blocks when no stripe subscription on file", async () => {
    mocks.rows.set("p1", {
      google_sub: "g",
      email: "u@x.io",
      stripe_subscription_id: null,
      subscription_status: null,
    });
    const r = await preflightCheck("p1");
    expect(r.ok).toBe(false);
    expect(r.blocker).toBe("no_stripe_sub");
  });

  it("blocks when subscription is not active or trialing", async () => {
    mocks.rows.set("p1", {
      google_sub: "g",
      email: "u@x.io",
      stripe_subscription_id: "sub-1",
      subscription_status: "past_due",
    });
    const r = await preflightCheck("p1");
    expect(r.ok).toBe(false);
    expect(r.blocker).toBe("stripe_inactive");
  });

  it("blocks when daily quota >=80%", async () => {
    process.env.SUPABASE_MGMT_DAILY_QUOTA = "100";
    mocks.dailyUsage = 80;
    mocks.rows.set("p1", {
      google_sub: "g",
      email: "u@x.io",
      stripe_subscription_id: "sub-1",
      subscription_status: "active",
    });
    const r = await preflightCheck("p1");
    expect(r.ok).toBe(false);
    expect(r.blocker).toBe("quota_exceeded");
  });

  it("blocks when an existing READY provision exists for the same google_sub", async () => {
    mocks.rows.set("p1", {
      google_sub: "g",
      email: "u@x.io",
      stripe_subscription_id: "sub-1",
      subscription_status: "active",
    });
    mocks.readyForSub = { id: "p-existing" };
    const r = await preflightCheck("p1");
    expect(r.ok).toBe(false);
    expect(r.blocker).toBe("duplicate_ready");
  });

  it("ok when all gates pass", async () => {
    mocks.rows.set("p1", {
      google_sub: "g",
      email: "u@x.io",
      stripe_subscription_id: "sub-1",
      subscription_status: "trialing",
    });
    const r = await preflightCheck("p1");
    expect(r.ok).toBe(true);
  });
});
