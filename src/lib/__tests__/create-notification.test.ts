import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

function createMockSupabase(profileData: Record<string, unknown> | null = null, insertError: { message: string } | null = null) {
  const insertMock = vi.fn(() => ({
    error: insertError,
  }));

  const profileChain: Record<string, ReturnType<typeof vi.fn>> = {};
  profileChain.select = vi.fn(() => profileChain);
  profileChain.eq = vi.fn(() => profileChain);
  profileChain.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: profileData,
      error: null,
    })
  );

  return {
    from: vi.fn((table: string) => {
      if (table === "notifications") {
        return { insert: insertMock };
      }
      if (table === "profiles") {
        return profileChain;
      }
      return {};
    }),
    _insertMock: insertMock,
  };
}

describe("create-notification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("createNotification", () => {
    it("creates notification successfully", async () => {
      const mock = createMockSupabase();
      const { createNotification } = await import("@/lib/create-notification");

      const result = await createNotification(mock as any, {
        userId: "user-1",
        type: "subscription_price_change",
        title: "Test",
        message: "Test message",
        metadata: { foo: "bar" },
      });

      expect(result).toEqual({ success: true });
      expect(mock._insertMock).toHaveBeenCalledWith({
        user_id: "user-1",
        type: "subscription_price_change",
        title: "Test",
        message: "Test message",
        metadata: { foo: "bar" },
      });
    });

    it("returns error on insert failure", async () => {
      const mock = createMockSupabase(null, { message: "insert failed" });
      const { createNotification } = await import("@/lib/create-notification");

      const result = await createNotification(mock as any, {
        userId: "user-1",
        type: "goal_milestone",
        title: "Test",
        message: "Test",
      });

      expect(result).toEqual({ success: false, error: "insert failed" });
    });

    it("defaults metadata to empty object when not provided", async () => {
      const mock = createMockSupabase();
      const { createNotification } = await import("@/lib/create-notification");

      await createNotification(mock as any, {
        userId: "user-1",
        type: "payment_reminder",
        title: "Test",
        message: "Test",
      });

      expect(mock._insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: {} })
      );
    });
  });

  describe("getNotificationPreferences", () => {
    it("returns defaults for user with no preferences", async () => {
      const mock = createMockSupabase({ notification_preferences: null });
      const { getNotificationPreferences, DEFAULT_PREFERENCES } = await import(
        "@/lib/create-notification"
      );

      const prefs = await getNotificationPreferences(mock as any, "user-1");
      expect(prefs).toEqual(DEFAULT_PREFERENCES);
    });

    it("returns stored preferences", async () => {
      const stored = {
        price_changes: { enabled: false },
        goal_milestones: { enabled: true },
        payment_reminders: {
          enabled: true,
          lead_days: 5,
          send_time: "10:00",
          timezone: "America/New_York",
        },
        weekly_summary: {
          enabled: true,
          day_of_week: "monday",
          send_time: "07:00",
          timezone: "America/New_York",
        },
      };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { getNotificationPreferences } = await import(
        "@/lib/create-notification"
      );

      const prefs = await getNotificationPreferences(mock as any, "user-1");
      expect(prefs.price_changes.enabled).toBe(false);
      expect(prefs.payment_reminders.lead_days).toBe(5);
      expect(prefs.weekly_summary.day_of_week).toBe("monday");
    });

    it("merges partial preferences with defaults", async () => {
      const stored = {
        price_changes: { enabled: false },
        // Missing goal_milestones, payment_reminders, weekly_summary
      };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { getNotificationPreferences } = await import(
        "@/lib/create-notification"
      );

      const prefs = await getNotificationPreferences(mock as any, "user-1");
      expect(prefs.price_changes.enabled).toBe(false);
      expect(prefs.goal_milestones.enabled).toBe(true); // default
      expect(prefs.payment_reminders.lead_days).toBe(3); // default
      expect(prefs.weekly_summary.enabled).toBe(false); // default
    });
  });

  describe("isNotificationEnabled", () => {
    it("returns true for enabled type", async () => {
      const stored = {
        price_changes: { enabled: true },
        goal_milestones: { enabled: true },
        payment_reminders: { enabled: true, lead_days: 3, send_time: "09:00", timezone: "Australia/Melbourne" },
        weekly_summary: { enabled: true, day_of_week: "sunday", send_time: "08:00", timezone: "Australia/Melbourne" },
      };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { isNotificationEnabled } = await import("@/lib/create-notification");

      expect(await isNotificationEnabled(mock as any, "user-1", "subscription_price_change")).toBe(true);
    });

    it("returns false for disabled type", async () => {
      const stored = {
        price_changes: { enabled: false },
        goal_milestones: { enabled: true },
        payment_reminders: { enabled: true, lead_days: 3, send_time: "09:00", timezone: "Australia/Melbourne" },
        weekly_summary: { enabled: false, day_of_week: "sunday", send_time: "08:00", timezone: "Australia/Melbourne" },
      };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { isNotificationEnabled } = await import("@/lib/create-notification");

      expect(await isNotificationEnabled(mock as any, "user-1", "subscription_price_change")).toBe(false);
    });

    it("maps subscription_price_change to price_changes.enabled", async () => {
      const stored = { price_changes: { enabled: false } };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { isNotificationEnabled } = await import("@/lib/create-notification");

      expect(await isNotificationEnabled(mock as any, "user-1", "subscription_price_change")).toBe(false);
    });

    it("maps goal_milestone to goal_milestones.enabled", async () => {
      const stored = { goal_milestones: { enabled: false } };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { isNotificationEnabled } = await import("@/lib/create-notification");

      expect(await isNotificationEnabled(mock as any, "user-1", "goal_milestone")).toBe(false);
    });

    it("maps payment_reminder to payment_reminders.enabled", async () => {
      const stored = { payment_reminders: { enabled: false, lead_days: 3, send_time: "09:00", timezone: "Australia/Melbourne" } };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { isNotificationEnabled } = await import("@/lib/create-notification");

      expect(await isNotificationEnabled(mock as any, "user-1", "payment_reminder")).toBe(false);
    });

    it("maps weekly_summary to weekly_summary.enabled", async () => {
      const stored = { weekly_summary: { enabled: false, day_of_week: "sunday", send_time: "08:00", timezone: "Australia/Melbourne" } };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { isNotificationEnabled } = await import("@/lib/create-notification");

      expect(await isNotificationEnabled(mock as any, "user-1", "weekly_summary")).toBe(false);
    });

    it("defaults to true for types with no explicit preference", async () => {
      const mock = createMockSupabase({ notification_preferences: null });
      const { isNotificationEnabled } = await import("@/lib/create-notification");

      // price_changes defaults to enabled: true
      expect(await isNotificationEnabled(mock as any, "user-1", "subscription_price_change")).toBe(true);
      expect(await isNotificationEnabled(mock as any, "user-1", "goal_milestone")).toBe(true);
    });
  });

  describe("getScheduleConfig", () => {
    it("returns payment_reminder schedule", async () => {
      const stored = {
        payment_reminders: {
          enabled: true,
          lead_days: 5,
          send_time: "10:00",
          timezone: "America/New_York",
        },
      };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { getScheduleConfig } = await import("@/lib/create-notification");

      const config = await getScheduleConfig(mock as any, "user-1", "payment_reminder");
      expect(config.lead_days).toBe(5);
      expect(config.send_time).toBe("10:00");
      expect(config.timezone).toBe("America/New_York");
      expect(config.day_of_week).toBeUndefined();
    });

    it("returns weekly_summary schedule", async () => {
      const stored = {
        weekly_summary: {
          enabled: true,
          day_of_week: "friday",
          send_time: "18:00",
          timezone: "Europe/London",
        },
      };
      const mock = createMockSupabase({ notification_preferences: stored });
      const { getScheduleConfig } = await import("@/lib/create-notification");

      const config = await getScheduleConfig(mock as any, "user-1", "weekly_summary");
      expect(config.day_of_week).toBe("friday");
      expect(config.send_time).toBe("18:00");
      expect(config.timezone).toBe("Europe/London");
      expect(config.lead_days).toBeUndefined();
    });

    it("returns defaults when user has no custom schedule", async () => {
      const mock = createMockSupabase({ notification_preferences: null });
      const { getScheduleConfig } = await import("@/lib/create-notification");

      const paymentConfig = await getScheduleConfig(mock as any, "user-1", "payment_reminder");
      expect(paymentConfig.lead_days).toBe(3);
      expect(paymentConfig.send_time).toBe("09:00");
      expect(paymentConfig.timezone).toBe("Australia/Melbourne");

      const weeklyConfig = await getScheduleConfig(mock as any, "user-1", "weekly_summary");
      expect(weeklyConfig.day_of_week).toBe("sunday");
      expect(weeklyConfig.send_time).toBe("08:00");
    });
  });
});
