import { describe, it, expect } from "vitest";
import { FunnelEvent, PROVISIONING_FUNNEL } from "@/lib/analytics/events";

/**
 * Phase 4 instrumentation: catalogue tests.
 * These guard against accidental renames that would break the funnel.
 */
describe("analytics/events", () => {
  describe("FunnelEvent catalogue", () => {
    it("includes every documented provisioning event", () => {
      // The /admin/funnel page assumes these exact keys
      expect(FunnelEvent.SIGNUP_STARTED).toBe("signup_started");
      expect(FunnelEvent.GOOGLE_SIGNED_IN).toBe("google_signed_in");
      expect(FunnelEvent.STRIPE_CHECKOUT_STARTED).toBe("stripe_checkout_started");
      expect(FunnelEvent.STRIPE_CHECKOUT_COMPLETED).toBe("stripe_checkout_completed");
      expect(FunnelEvent.SUPABASE_OAUTH_COMPLETED).toBe("supabase_oauth_completed");
      expect(FunnelEvent.VERCEL_OAUTH_COMPLETED).toBe("vercel_oauth_completed");
      expect(FunnelEvent.TENANT_PROVISIONING_STARTED).toBe("tenant_provisioning_started");
      expect(FunnelEvent.TENANT_READY).toBe("tenant_ready");
      expect(FunnelEvent.UP_PAT_PROVIDED).toBe("up_pat_provided");
      expect(FunnelEvent.FIRST_SYNC_COMPLETED).toBe("first_sync_completed");
    });

    it("includes every documented activation event", () => {
      expect(FunnelEvent.FIRST_TRANSACTION_SEEN).toBe("first_transaction_seen");
      expect(FunnelEvent.FIRST_BUDGET_CREATED).toBe("first_budget_created");
      expect(FunnelEvent.FIRST_GOAL_CREATED).toBe("first_goal_created");
      expect(FunnelEvent.FIRST_PENNY_MESSAGE).toBe("first_penny_message");
    });

    it("includes every documented retention event", () => {
      expect(FunnelEvent.RETURNED_D1).toBe("returned_d1");
      expect(FunnelEvent.RETURNED_D7).toBe("returned_d7");
      expect(FunnelEvent.RETURNED_D30).toBe("returned_d30");
    });
  });

  describe("PROVISIONING_FUNNEL", () => {
    it("starts with signup_started", () => {
      expect(PROVISIONING_FUNNEL[0]).toBe(FunnelEvent.SIGNUP_STARTED);
    });

    it("ends with first_sync_completed", () => {
      expect(PROVISIONING_FUNNEL[PROVISIONING_FUNNEL.length - 1]).toBe(
        FunnelEvent.FIRST_SYNC_COMPLETED
      );
    });

    it("contains exactly 10 steps in the right order", () => {
      expect(PROVISIONING_FUNNEL).toEqual([
        FunnelEvent.SIGNUP_STARTED,
        FunnelEvent.GOOGLE_SIGNED_IN,
        FunnelEvent.STRIPE_CHECKOUT_STARTED,
        FunnelEvent.STRIPE_CHECKOUT_COMPLETED,
        FunnelEvent.SUPABASE_OAUTH_COMPLETED,
        FunnelEvent.VERCEL_OAUTH_COMPLETED,
        FunnelEvent.TENANT_PROVISIONING_STARTED,
        FunnelEvent.TENANT_READY,
        FunnelEvent.UP_PAT_PROVIDED,
        FunnelEvent.FIRST_SYNC_COMPLETED,
      ]);
    });

    it("has no duplicate steps", () => {
      const set = new Set(PROVISIONING_FUNNEL);
      expect(set.size).toBe(PROVISIONING_FUNNEL.length);
    });
  });
});
