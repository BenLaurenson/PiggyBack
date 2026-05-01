/**
 * Stripe webhook tests — focuses on the Plan #5 state-machine wiring on
 * checkout.session.completed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    verify: vi.fn(),
    attachStripeIds: vi.fn(async () => undefined),
    audit: vi.fn(async () => undefined),
    markSubscriptionCancelled: vi.fn(async () => undefined),
    getProvisionByStripeCustomer: vi.fn(async () => null),
    track: vi.fn(),
    rows: new Map<string, Record<string, unknown>>(),
  },
}));

vi.mock("@/lib/provisioner/stripe-client", () => ({
  verifyStripeWebhook: mocks.verify,
}));

vi.mock("@/lib/log-scrubber", () => ({
  installLogScrubber: () => undefined,
}));

vi.mock("@/lib/provisioner/state-machine", () => ({
  attachStripeIds: mocks.attachStripeIds,
  audit: mocks.audit,
  markSubscriptionCancelled: mocks.markSubscriptionCancelled,
  getProvisionByStripeCustomer: mocks.getProvisionByStripeCustomer,
}));

vi.mock("@/lib/analytics/server", () => ({
  track: mocks.track,
}));

vi.mock("@/lib/analytics/events", () => ({
  FunnelEvent: {
    STRIPE_CHECKOUT_COMPLETED: "stripe_checkout_completed",
  },
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      update: (fields: Record<string, unknown>) => ({
        eq: (_f1: string, v1: string) => ({
          in: async (_f2: string, _states: string[]) => {
            const cur = mocks.rows.get(v1) ?? { id: v1 };
            mocks.rows.set(v1, { ...cur, ...fields });
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

import { POST } from "./route";

describe("stripe webhook → Plan #5 state-machine wiring", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    Object.values(mocks).forEach((v) => {
      if (typeof v === "function" && "mockReset" in v) {
        (v as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    mocks.rows.clear();
  });
  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("checkout.session.completed transitions row to STRIPE_PAID", async () => {
    mocks.verify.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { provision_id: "prov-1" },
        },
      },
    });

    const req = new Request("https://x/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "v1=abc" },
      body: "{}",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mocks.rows.get("prov-1")?.state).toBe("STRIPE_PAID");
    expect(mocks.attachStripeIds).toHaveBeenCalledWith(
      "prov-1",
      expect.objectContaining({ customerId: "cus_1" })
    );
  });
});
