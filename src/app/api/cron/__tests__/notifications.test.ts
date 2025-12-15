import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/create-notification", () => ({
  createNotification: vi.fn(() => Promise.resolve({ success: true })),
  isNotificationEnabled: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/ai-tools", () => ({
  createFinancialTools: vi.fn(() => ({})),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(() => Promise.resolve({ text: "Your weekly summary" })),
  wrapLanguageModel: vi.fn((opts: any) => opts.model),
  addToolInputExamplesMiddleware: vi.fn(() => ({})),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => "mock-model")),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({ chat: vi.fn(() => "mock-model") })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => "mock-model")),
}));

const CRON_SECRET = "test-cron-secret";

function createCronMockSupabase(
  profiles: Record<string, unknown>[] = [],
  expenses: Record<string, unknown>[] = [],
  existingNotifications: Record<string, unknown>[] = []
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            data: profiles,
            error: null,
          })),
        };
      }
      if (table === "partnership_members") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data: { partnership_id: "partnership-1" },
                    error: null,
                  })
                ),
              })),
            })),
          })),
        };
      }
      if (table === "expense_definitions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn(() => ({
                  eq: vi.fn(() =>
                    Promise.resolve({
                      data: expenses,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "notifications") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  contains: vi.fn(() => ({
                    maybeSingle: vi.fn(() =>
                      Promise.resolve({
                        data: existingNotifications.length > 0 ? existingNotifications[0] : null,
                        error: null,
                      })
                    ),
                  })),
                })),
                gte: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: existingNotifications.length > 0 ? existingNotifications[0] : null,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          })),
          insert: vi.fn(() => ({ error: null })),
        };
      }
      if (table === "accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() =>
                Promise.resolve({
                  data: [{ id: "acc-1" }],
                  error: null,
                })
              ),
            })),
          })),
        };
      }
      return {};
    }),
  };
}

describe("cron/notifications route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  it("rejects requests without CRON_SECRET", async () => {
    const mockSupabase = createCronMockSupabase();
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    (createServiceRoleClient as any).mockReturnValue(mockSupabase);

    const { GET } = await import("@/app/api/cron/notifications/route");
    const req = new Request("http://localhost/api/cron/notifications", {
      headers: {},
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("rejects requests with wrong CRON_SECRET", async () => {
    const mockSupabase = createCronMockSupabase();
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    (createServiceRoleClient as any).mockReturnValue(mockSupabase);

    const { GET } = await import("@/app/api/cron/notifications/route");
    const req = new Request("http://localhost/api/cron/notifications", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns success with correct CRON_SECRET", async () => {
    const mockSupabase = createCronMockSupabase();
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    (createServiceRoleClient as any).mockReturnValue(mockSupabase);

    const { GET } = await import("@/app/api/cron/notifications/route");
    const req = new Request("http://localhost/api/cron/notifications", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("skips users with payment_reminders disabled", async () => {
    const profiles = [
      {
        id: "user-1",
        notification_preferences: {
          payment_reminders: { enabled: false, lead_days: 3, send_time: "09:00", timezone: "UTC" },
        },
      },
    ];
    const mockSupabase = createCronMockSupabase(profiles);
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    (createServiceRoleClient as any).mockReturnValue(mockSupabase);

    const { GET } = await import("@/app/api/cron/notifications/route");
    const req = new Request("http://localhost/api/cron/notifications", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await GET(req);
    const body = await res.json();
    expect(body.payment_reminders).toBe(0);
  });

  it("skips weekly summary users without AI key", async () => {
    const profiles = [
      {
        id: "user-1",
        notification_preferences: {
          weekly_summary: { enabled: true, day_of_week: "sunday", send_time: "08:00", timezone: "UTC" },
        },
        ai_provider: "google",
        ai_api_key: null, // No key
        ai_model: null,
      },
    ];
    const mockSupabase = createCronMockSupabase(profiles);
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    (createServiceRoleClient as any).mockReturnValue(mockSupabase);

    const { GET } = await import("@/app/api/cron/notifications/route");
    const req = new Request("http://localhost/api/cron/notifications", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    const res = await GET(req);
    const body = await res.json();
    expect(body.weekly_summaries).toBe(0);
  });

  it("handles AI generation failure gracefully", async () => {
    // Mock generateText to throw
    const { generateText } = await import("ai");
    (generateText as any).mockRejectedValueOnce(new Error("AI API error"));

    const now = new Date();
    const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase();
    const hour = now.getUTCHours().toString().padStart(2, "0");

    const profiles = [
      {
        id: "user-1",
        notification_preferences: {
          weekly_summary: {
            enabled: true,
            day_of_week: dayOfWeek,
            send_time: `${hour}:00`,
            timezone: "UTC",
          },
        },
        ai_provider: "google",
        ai_api_key: "test-key",
        ai_model: "gemini-2.0-flash",
      },
    ];
    const mockSupabase = createCronMockSupabase(profiles);
    const { createServiceRoleClient } = await import("@/utils/supabase/service-role");
    (createServiceRoleClient as any).mockReturnValue(mockSupabase);

    const { GET } = await import("@/app/api/cron/notifications/route");
    const req = new Request("http://localhost/api/cron/notifications", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    // Should not throw — errors are caught per-user
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.errors).toBeGreaterThanOrEqual(1);
  });
});
