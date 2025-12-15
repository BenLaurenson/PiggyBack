/**
 * Notification creation utility
 * Used by webhook handler (service role), server actions (user session), and cron routes
 */

import { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "subscription_price_change"
  | "unmatched_subscription"
  | "goal_milestone"
  | "payment_reminder"
  | "weekly_summary";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// Preference shape matching the JSONB column on profiles
export interface NotificationPreferences {
  price_changes: { enabled: boolean };
  goal_milestones: { enabled: boolean };
  payment_reminders: {
    enabled: boolean;
    lead_days: number;
    send_time: string;
    timezone: string;
  };
  weekly_summary: {
    enabled: boolean;
    day_of_week: string;
    send_time: string;
    timezone: string;
  };
}

export interface ScheduleConfig {
  send_time: string;
  timezone: string;
  lead_days?: number;
  day_of_week?: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  price_changes: { enabled: true },
  goal_milestones: { enabled: true },
  payment_reminders: {
    enabled: true,
    lead_days: 3,
    send_time: "09:00",
    timezone: "Australia/Melbourne",
  },
  weekly_summary: {
    enabled: false,
    day_of_week: "sunday",
    send_time: "08:00",
    timezone: "Australia/Melbourne",
  },
};

// Maps notification type to preference key
const TYPE_TO_PREFERENCE_KEY: Record<NotificationType, keyof NotificationPreferences> = {
  subscription_price_change: "price_changes",
  unmatched_subscription: "price_changes",
  goal_milestone: "goal_milestones",
  payment_reminder: "payment_reminders",
  weekly_summary: "weekly_summary",
};

export async function createNotification(
  supabase: SupabaseClient,
  params: CreateNotificationParams
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    metadata: params.metadata || {},
  });

  if (error) {
    console.error("Failed to create notification:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getNotificationPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationPreferences> {
  const { data } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", userId)
    .maybeSingle();

  const stored = data?.notification_preferences as Partial<NotificationPreferences> | null;

  if (!stored) {
    return { ...DEFAULT_PREFERENCES };
  }

  // Deep merge stored with defaults
  return {
    price_changes: {
      ...DEFAULT_PREFERENCES.price_changes,
      ...(stored.price_changes || {}),
    },
    goal_milestones: {
      ...DEFAULT_PREFERENCES.goal_milestones,
      ...(stored.goal_milestones || {}),
    },
    payment_reminders: {
      ...DEFAULT_PREFERENCES.payment_reminders,
      ...(stored.payment_reminders || {}),
    },
    weekly_summary: {
      ...DEFAULT_PREFERENCES.weekly_summary,
      ...(stored.weekly_summary || {}),
    },
  };
}

export async function isNotificationEnabled(
  supabase: SupabaseClient,
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const prefs = await getNotificationPreferences(supabase, userId);
  const key = TYPE_TO_PREFERENCE_KEY[type];

  if (!key) return true; // Unknown types default to enabled

  const section = prefs[key];
  return section?.enabled ?? true;
}

export async function getScheduleConfig(
  supabase: SupabaseClient,
  userId: string,
  type: "payment_reminder" | "weekly_summary"
): Promise<ScheduleConfig> {
  const prefs = await getNotificationPreferences(supabase, userId);

  if (type === "payment_reminder") {
    return {
      send_time: prefs.payment_reminders.send_time,
      timezone: prefs.payment_reminders.timezone,
      lead_days: prefs.payment_reminders.lead_days,
    };
  }

  return {
    send_time: prefs.weekly_summary.send_time,
    timezone: prefs.weekly_summary.timezone,
    day_of_week: prefs.weekly_summary.day_of_week,
  };
}

export { DEFAULT_PREFERENCES };
