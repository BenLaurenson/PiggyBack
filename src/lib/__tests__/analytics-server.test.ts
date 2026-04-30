import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the server-side analytics dispatcher.
 *
 * Exercises the gating behavior:
 *   - PostHog disabled by default (NEXT_PUBLIC_ANALYTICS_ENABLED unset)
 *   - PostHog enabled only when both env var AND key are set
 *   - funnel_events mirror written whenever SUPABASE_SERVICE_ROLE_KEY exists
 *   - failures in either sink never throw
 */

const insertMock = vi.fn();
const fromMock = vi.fn((_table?: string) => ({
  insert: insertMock,
} as { insert: typeof insertMock; select?: typeof selectMock }));
const selectMock = vi.fn();

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("analytics/server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
    fetchMock.mockResolvedValue({ ok: true });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("writes to funnel_events when SUPABASE_SERVICE_ROLE_KEY is set", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "false");

    const { track } = await import("@/lib/analytics/server");
    const { FunnelEvent } = await import("@/lib/analytics/events");

    await track(FunnelEvent.SIGNUP_STARTED, {
      anonymousId: "anon-1",
      properties: { source: "test" },
    });

    expect(fromMock).toHaveBeenCalledWith("funnel_events");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "signup_started",
        anonymous_id: "anon-1",
        user_id: null,
        tenant_id: null,
        properties: { source: "test" },
      })
    );
  });

  it("does not call PostHog when NEXT_PUBLIC_ANALYTICS_ENABLED is unset", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    // NEXT_PUBLIC_ANALYTICS_ENABLED intentionally unset
    vi.stubEnv("POSTHOG_API_KEY", "phc_test");

    const { track } = await import("@/lib/analytics/server");
    const { FunnelEvent } = await import("@/lib/analytics/events");

    await track(FunnelEvent.SIGNUP_STARTED, { anonymousId: "anon-1" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to PostHog when both env var AND key are set", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "true");
    vi.stubEnv("POSTHOG_API_KEY", "phc_test");

    const { track } = await import("@/lib/analytics/server");
    const { FunnelEvent } = await import("@/lib/analytics/events");

    await track(FunnelEvent.TENANT_READY, {
      userId: "user-42",
      tenantId: "user-42",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/capture/");
    const body = JSON.parse((init as { body: string }).body);
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("tenant_ready");
    expect(body.distinct_id).toBe("user-42");
    expect(body.properties.tenant_id).toBe("user-42");
  });

  it("uses NEXT_PUBLIC_POSTHOG_HOST when configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "true");
    vi.stubEnv("POSTHOG_API_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");

    const { track } = await import("@/lib/analytics/server");
    const { FunnelEvent } = await import("@/lib/analytics/events");

    await track(FunnelEvent.SIGNUP_STARTED, { anonymousId: "anon-1" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://eu.i.posthog.com/capture/");
  });

  it("never throws when funnel_events insert fails", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    insertMock.mockResolvedValueOnce({ error: { message: "rls denied" } });

    const { track } = await import("@/lib/analytics/server");
    const { FunnelEvent } = await import("@/lib/analytics/events");

    await expect(
      track(FunnelEvent.SIGNUP_STARTED, { anonymousId: "anon-1" })
    ).resolves.toBeUndefined();
  });

  it("never throws when PostHog fetch fails", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "true");
    vi.stubEnv("POSTHOG_API_KEY", "phc_test");
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const { track } = await import("@/lib/analytics/server");
    const { FunnelEvent } = await import("@/lib/analytics/events");

    await expect(
      track(FunnelEvent.SIGNUP_STARTED, { anonymousId: "anon-1" })
    ).resolves.toBeUndefined();
  });

  describe("trackFirst", () => {
    beforeEach(() => {
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
      // Build a mock select chain: select(...).eq(...).eq(...) returns {count}
      const eqStep2 = vi.fn().mockResolvedValue({ count: 0 });
      const eqStep1 = vi.fn().mockReturnValue({ eq: eqStep2 });
      selectMock.mockReturnValue({ eq: eqStep1 });
      fromMock.mockImplementation((table?: string) => {
        if (table === "funnel_events") {
          return {
            insert: insertMock,
            select: selectMock,
          };
        }
        return { insert: insertMock };
      });
    });

    it("inserts when no prior event exists for the user", async () => {
      const { trackFirst } = await import("@/lib/analytics/server");
      const { FunnelEvent } = await import("@/lib/analytics/events");

      await trackFirst(FunnelEvent.FIRST_BUDGET_CREATED, { userId: "user-1" });
      expect(insertMock).toHaveBeenCalled();
    });

    it("skips when a prior event exists", async () => {
      // Override count: simulate already-fired
      const eqStep2 = vi.fn().mockResolvedValue({ count: 1 });
      const eqStep1 = vi.fn().mockReturnValue({ eq: eqStep2 });
      selectMock.mockReturnValueOnce({ eq: eqStep1 });

      const { trackFirst } = await import("@/lib/analytics/server");
      const { FunnelEvent } = await import("@/lib/analytics/events");

      await trackFirst(FunnelEvent.FIRST_BUDGET_CREATED, { userId: "user-1" });
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("falls through to insert when dedupe lookup throws", async () => {
      const eqStep2 = vi.fn().mockRejectedValue(new Error("db down"));
      const eqStep1 = vi.fn().mockReturnValue({ eq: eqStep2 });
      selectMock.mockReturnValueOnce({ eq: eqStep1 });

      const { trackFirst } = await import("@/lib/analytics/server");
      const { FunnelEvent } = await import("@/lib/analytics/events");

      await trackFirst(FunnelEvent.FIRST_GOAL_CREATED, { userId: "user-2" });
      expect(insertMock).toHaveBeenCalled();
    });

    it("falls through when no userId is provided (no dedupe possible)", async () => {
      const { trackFirst } = await import("@/lib/analytics/server");
      const { FunnelEvent } = await import("@/lib/analytics/events");

      await trackFirst(FunnelEvent.FIRST_GOAL_CREATED, {});
      expect(insertMock).toHaveBeenCalled();
    });
  });

  describe("analyticsConfigured", () => {
    it("reports both sinks disabled when env is empty", async () => {
      const { analyticsConfigured } = await import("@/lib/analytics/server");
      const config = analyticsConfigured();
      expect(config.postHog).toBe(false);
      expect(config.localMirror).toBe(false);
    });

    it("reports localMirror=true when service-role key is set", async () => {
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
      const { analyticsConfigured } = await import("@/lib/analytics/server");
      expect(analyticsConfigured().localMirror).toBe(true);
    });

    it("reports postHog=true when both env var and key are set", async () => {
      vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "true");
      vi.stubEnv("POSTHOG_API_KEY", "phc_test");
      const { analyticsConfigured } = await import("@/lib/analytics/server");
      expect(analyticsConfigured().postHog).toBe(true);
    });
  });
});
