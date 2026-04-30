/**
 * Phase 4 #54 follow-up: provisioning-funnel instrumentation tests.
 *
 * Verifies the four previously-unfired events fire from their respective
 * routes with correct names, useful properties, and *no* token/secret leaks.
 *
 *   - stripe_checkout_started      — POST /api/stripe/checkout
 *   - stripe_checkout_completed    — POST /api/stripe/webhook
 *   - supabase_oauth_completed     — GET  /oauth/supabase/callback
 *   - vercel_oauth_completed       — GET  /oauth/vercel/callback
 *
 * For each route we mock every external dependency so the test is purely
 * a contract check on the analytics call shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared analytics mock ──────────────────────────────────────────────────

const trackMock = vi.fn(() => Promise.resolve());
vi.mock("@/lib/analytics/server", () => ({
  track: trackMock,
}));

// ─── Common collaborators ───────────────────────────────────────────────────

vi.mock("@/lib/log-scrubber", () => ({
  installLogScrubber: vi.fn(),
}));

vi.mock("@/lib/provisioner/state-machine", () => ({
  attachStripeIds: vi.fn(() => Promise.resolve()),
  audit: vi.fn(() => Promise.resolve()),
  getProvisionById: vi.fn(),
  getProvisionByStripeCustomer: vi.fn(),
  markSubscriptionCancelled: vi.fn(() => Promise.resolve()),
  storeOAuthToken: vi.fn(() => Promise.resolve()),
  transitionState: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/provisioner/stripe-client", () => ({
  createCheckoutSession: vi.fn(() =>
    Promise.resolve({ id: "cs_test_abc123", url: "https://checkout.stripe.com/c/pay/cs_test_abc123" })
  ),
  createCustomer: vi.fn(() => Promise.resolve({ id: "cus_test_xyz" })),
  verifyStripeWebhook: vi.fn(),
}));

vi.mock("@/lib/provisioner/supabase-mgmt", () => ({
  exchangeSupabaseAuthCode: vi.fn(() =>
    Promise.resolve({
      // Realistic-looking secrets — these MUST NOT appear in event properties.
      access_token: "sba_supabase_oauth_access_token_should_never_leak_aaaaaaa",
      refresh_token: "sba_supabase_oauth_refresh_token_should_never_leak_bbbbbb",
      expires_in: 3600,
      scope: "all",
    })
  ),
}));

vi.mock("@/lib/provisioner/vercel-api", () => ({
  exchangeVercelAuthCode: vi.fn(() =>
    Promise.resolve({
      access_token: "vcp_vercel_oauth_access_token_should_never_leak_cccccccc",
      token_type: "Bearer",
      installation_id: "icfg_xyz",
      user_id: "u_test",
      team_id: "team_test",
    })
  ),
}));

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a real NextRequest with a JSON body, optional cookies, optional URL. */
async function makeRequest(opts: {
  url?: string;
  method?: string;
  body?: unknown;
  cookieHeader?: string;
}) {
  const { NextRequest } = await import("next/server");
  const init: RequestInit & { headers: Record<string, string> } = {
    method: opts.method ?? "GET",
    headers: {},
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers["Content-Type"] = "application/json";
  }
  if (opts.cookieHeader) {
    init.headers.cookie = opts.cookieHeader;
  }
  return new NextRequest(opts.url ?? "https://piggyback.finance/", init);
}

/**
 * Walk the event payload looking for any string that looks like a secret.
 * The log-scrubber regexes are the canonical source of truth — we mirror
 * the prefixes here and add a couple extras for tightness.
 */
function findSecretShapedStrings(payload: unknown): string[] {
  const SECRET_PREFIXES = [
    "sba_",
    "sbp_",
    "sb_secret_",
    "sk_live_",
    "sk_test_",
    "rk_live_",
    "rk_test_",
    "whsec_",
    "vcp_",
    "GOCSPX-",
    "sk-ant-api03-",
    "AIzaSy",
    "up:yeah:",
    "up:demo:",
  ];
  const hits: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === "string") {
      for (const p of SECRET_PREFIXES) {
        if (v.includes(p)) hits.push(v);
      }
      // Also catch JWT-shaped strings.
      if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(v)) {
        hits.push(v);
      }
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(visit);
    }
  };
  visit(payload);
  return hits;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("provisioning funnel instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("POST /api/stripe/checkout — stripe_checkout_started", () => {
    it("fires the event with provision_id + session_id and uses the pb_aid cookie", async () => {
      vi.stubEnv("STRIPE_PRICE_ID", "price_test_123");

      const sm = await import("@/lib/provisioner/state-machine");
      vi.mocked(sm.getProvisionById).mockResolvedValue({
        id: "prov-uuid-1",
        google_sub: "g-1",
        email: "user@example.com",
        display_name: null,
        avatar_url: null,
        state: "SIGNED_IN",
        state_detail: null,
        state_updated_at: new Date().toISOString(),
        subdomain_short_id: "abc123",
        subdomain_vanity: null,
        subdomain_vanity_set_at: null,
        supabase_org_id: null,
        supabase_project_ref: null,
        supabase_project_url: null,
        vercel_team_id: null,
        vercel_project_id: null,
        vercel_deployment_url: null,
        // Force the createCustomer path so we exercise more code.
        stripe_customer_id: null,
        stripe_subscription_id: null,
        subscription_status: null,
      });

      const { POST } = await import("@/app/api/stripe/checkout/route");
      const res = await POST(
        await makeRequest({
          url: "https://piggyback.finance/api/stripe/checkout",
          method: "POST",
          body: { provisionId: "prov-uuid-1" },
          cookieHeader: "pb_aid=anon-cookie-1; other=foo",
        })
      );
      expect(res.status).toBe(200);

      expect(trackMock).toHaveBeenCalledOnce();
      const [event, opts] = trackMock.mock.calls[0];
      expect(event).toBe("stripe_checkout_started");
      expect(opts).toMatchObject({
        anonymousId: "anon-cookie-1",
        properties: {
          provision_id: "prov-uuid-1",
          session_id: "cs_test_abc123",
        },
      });
      expect(findSecretShapedStrings(opts)).toEqual([]);

      vi.unstubAllEnvs();
    });
  });

  describe("POST /api/stripe/webhook — stripe_checkout_completed", () => {
    it("fires the event with provision_id, session_id, and subscription_id only", async () => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy_for_test_only_xxxxxxxxxxxxx");

      const stripe = await import("@/lib/provisioner/stripe-client");
      vi.mocked(stripe.verifyStripeWebhook).mockReturnValue({
        id: "evt_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_completed_999",
            customer: "cus_done_xyz",
            subscription: "sub_done_xyz",
            metadata: { provision_id: "prov-uuid-2" },
          },
        },
      } as unknown as Awaited<ReturnType<typeof stripe.verifyStripeWebhook>>);

      const { POST } = await import("@/app/api/stripe/webhook/route");
      const res = await POST(
        await makeRequest({
          url: "https://piggyback.finance/api/stripe/webhook",
          method: "POST",
          body: { not: "actually checked because verifyStripeWebhook is mocked" },
          cookieHeader: "irrelevant=1",
        })
      );
      expect(res.status).toBe(200);

      expect(trackMock).toHaveBeenCalledOnce();
      const [event, opts] = trackMock.mock.calls[0];
      expect(event).toBe("stripe_checkout_completed");
      expect(opts).toMatchObject({
        properties: {
          provision_id: "prov-uuid-2",
          session_id: "cs_test_completed_999",
          subscription_id: "sub_done_xyz",
        },
      });
      // Webhook fires server-to-server — no anonymousId/userId expected.
      expect(opts.anonymousId).toBeUndefined();
      expect(opts.userId).toBeUndefined();
      expect(findSecretShapedStrings(opts)).toEqual([]);

      vi.unstubAllEnvs();
    });

    it("does not fire the event when checkout.session has no provision_id metadata", async () => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy_for_test_only_xxxxxxxxxxxxx");

      const stripe = await import("@/lib/provisioner/stripe-client");
      vi.mocked(stripe.verifyStripeWebhook).mockReturnValue({
        id: "evt_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_no_prov",
            customer: "cus_x",
            subscription: null,
            metadata: {}, // no provision_id
          },
        },
      } as unknown as Awaited<ReturnType<typeof stripe.verifyStripeWebhook>>);

      const { POST } = await import("@/app/api/stripe/webhook/route");
      const res = await POST(
        await makeRequest({
          url: "https://piggyback.finance/api/stripe/webhook",
          method: "POST",
          body: {},
        })
      );
      expect(res.status).toBe(200);
      expect(trackMock).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });

  describe("GET /oauth/supabase/callback — supabase_oauth_completed", () => {
    it("fires the event after token exchange + storage, never leaking tokens", async () => {
      vi.stubEnv("SUPABASE_OAUTH_CLIENT_ID", "client-id-test");
      vi.stubEnv("SUPABASE_OAUTH_CLIENT_SECRET", "client-secret-test");

      const sm = await import("@/lib/provisioner/state-machine");
      vi.mocked(sm.getProvisionById).mockResolvedValue({
        id: "prov-uuid-3",
        google_sub: "g-3",
        email: "u@e.com",
        display_name: null,
        avatar_url: null,
        state: "SIGNED_IN",
        state_detail: null,
        state_updated_at: new Date().toISOString(),
        subdomain_short_id: "x9z",
        subdomain_vanity: null,
        subdomain_vanity_set_at: null,
        supabase_org_id: null,
        supabase_project_ref: null,
        supabase_project_url: null,
        vercel_team_id: null,
        vercel_project_id: null,
        vercel_deployment_url: null,
        stripe_customer_id: "cus_x",
        stripe_subscription_id: "sub_x",
        subscription_status: "active",
      });

      const { GET } = await import("@/app/oauth/supabase/callback/route");
      const res = await GET(
        await makeRequest({
          url: "https://piggyback.finance/oauth/supabase/callback?code=abc&state=prov-uuid-3",
          method: "GET",
          cookieHeader: "pb_aid=anon-cookie-3",
        })
      );
      // Redirect on success
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);

      expect(sm.storeOAuthToken).toHaveBeenCalled();
      expect(sm.transitionState).toHaveBeenCalledWith(
        "prov-uuid-3",
        "SUPABASE_AUTHED",
        expect.any(String)
      );

      expect(trackMock).toHaveBeenCalledOnce();
      const [event, opts] = trackMock.mock.calls[0];
      expect(event).toBe("supabase_oauth_completed");
      expect(opts).toMatchObject({
        anonymousId: "anon-cookie-3",
        properties: { provision_id: "prov-uuid-3" },
      });
      // Must NOT contain access_token / refresh_token / scope.
      expect(Object.keys(opts.properties as object)).not.toContain("access_token");
      expect(Object.keys(opts.properties as object)).not.toContain("refresh_token");
      expect(findSecretShapedStrings(opts)).toEqual([]);

      vi.unstubAllEnvs();
    });

    it("does not fire the event when token exchange throws", async () => {
      vi.stubEnv("SUPABASE_OAUTH_CLIENT_ID", "client-id-test");
      vi.stubEnv("SUPABASE_OAUTH_CLIENT_SECRET", "client-secret-test");

      const sm = await import("@/lib/provisioner/state-machine");
      vi.mocked(sm.getProvisionById).mockResolvedValue({
        id: "prov-uuid-fail",
      } as unknown as Awaited<ReturnType<typeof sm.getProvisionById>>);

      const supabase = await import("@/lib/provisioner/supabase-mgmt");
      vi.mocked(supabase.exchangeSupabaseAuthCode).mockRejectedValueOnce(
        new Error("oauth_provider_down")
      );

      const { GET } = await import("@/app/oauth/supabase/callback/route");
      const res = await GET(
        await makeRequest({
          url: "https://piggyback.finance/oauth/supabase/callback?code=abc&state=prov-uuid-fail",
          method: "GET",
        })
      );
      // Failure also redirects (with ?error=...), but no event fires.
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(trackMock).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
    });
  });

  describe("GET /oauth/vercel/callback — vercel_oauth_completed", () => {
    it("fires the event with provision_id, team_id, configuration_id and no tokens", async () => {
      vi.stubEnv("VERCEL_OAUTH_CLIENT_ID", "vcl-cid");
      vi.stubEnv("VERCEL_OAUTH_CLIENT_SECRET", "vcl-csecret");

      const sm = await import("@/lib/provisioner/state-machine");
      vi.mocked(sm.getProvisionById).mockResolvedValue({
        id: "prov-uuid-4",
      } as unknown as Awaited<ReturnType<typeof sm.getProvisionById>>);

      const { GET } = await import("@/app/oauth/vercel/callback/route");
      const res = await GET(
        await makeRequest({
          url:
            "https://piggyback.finance/oauth/vercel/callback?code=abc&configurationId=icfg_xyz&teamId=team_zzz&state=prov-uuid-4",
          method: "GET",
          cookieHeader: "pb_aid=anon-cookie-4",
        })
      );
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);

      expect(sm.storeOAuthToken).toHaveBeenCalled();
      expect(sm.transitionState).toHaveBeenCalledWith(
        "prov-uuid-4",
        "VERCEL_AUTHED",
        expect.any(String)
      );

      expect(trackMock).toHaveBeenCalledOnce();
      const [event, opts] = trackMock.mock.calls[0];
      expect(event).toBe("vercel_oauth_completed");
      expect(opts).toMatchObject({
        anonymousId: "anon-cookie-4",
        properties: {
          provision_id: "prov-uuid-4",
          team_id: "team_zzz",
          configuration_id: "icfg_xyz",
        },
      });
      expect(Object.keys(opts.properties as object)).not.toContain("access_token");
      expect(findSecretShapedStrings(opts)).toEqual([]);

      vi.unstubAllEnvs();
    });
  });
});
