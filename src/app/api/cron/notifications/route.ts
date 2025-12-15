import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  createNotification,
  isNotificationEnabled,
  type NotificationPreferences,
} from "@/lib/create-notification";
import { createFinancialTools } from "@/lib/ai-tools";
import { generateText, wrapLanguageModel, addToolInputExamplesMiddleware, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const DEFAULT_PREFS: NotificationPreferences = {
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

function getUserLocalHour(timezone: string, now: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(now), 10);
}

function getUserLocalDayOfWeek(timezone: string, now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  });
  return formatter.format(now).toLowerCase();
}

function parseHour(sendTime: string): number {
  const [hourStr] = sendTime.split(":");
  return parseInt(hourStr, 10);
}

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const results = { payment_reminders: 0, weekly_summaries: 0, errors: 0 };

  // --- Payment Reminders ---
  try {
    const { data: reminderUsers } = await supabase
      .from("profiles")
      .select("id, notification_preferences");

    for (const profile of reminderUsers || []) {
      try {
        const prefs = {
          ...DEFAULT_PREFS,
          ...(profile.notification_preferences || {}),
        } as NotificationPreferences;
        const reminderPrefs = {
          ...DEFAULT_PREFS.payment_reminders,
          ...(prefs.payment_reminders || {}),
        };

        if (!reminderPrefs.enabled) continue;

        // Check if current hour matches user's send_time in their timezone
        const userHour = getUserLocalHour(reminderPrefs.timezone, now);
        const targetHour = parseHour(reminderPrefs.send_time);
        if (userHour !== targetHour) continue;

        // Get user's partnership
        const { data: membership } = await supabase
          .from("partnership_members")
          .select("partnership_id")
          .eq("user_id", profile.id)
          .limit(1)
          .maybeSingle();

        if (!membership) continue;

        // Get expenses due within lead_days
        const leadDate = new Date(now);
        leadDate.setDate(leadDate.getDate() + reminderPrefs.lead_days);
        const leadDateStr = leadDate.toISOString().split("T")[0];
        const todayStr = now.toISOString().split("T")[0];

        const { data: expenses } = await supabase
          .from("expense_definitions")
          .select("id, name, expected_amount_cents, next_due_date")
          .eq("partnership_id", membership.partnership_id)
          .gte("next_due_date", todayStr)
          .lte("next_due_date", leadDateStr)
          .eq("is_active", true);

        for (const expense of expenses || []) {
          // Deduplicate: skip if unactioned reminder exists
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", profile.id)
            .eq("type", "payment_reminder")
            .eq("actioned", false)
            .contains("metadata", { expense_id: expense.id })
            .maybeSingle();

          if (existing) continue;

          const dueDate = new Date(expense.next_due_date);
          const daysUntil = Math.ceil(
            (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          const amountStr = expense.expected_amount_cents
            ? `$${(expense.expected_amount_cents / 100).toFixed(2)}`
            : "";

          await createNotification(supabase, {
            userId: profile.id,
            type: "payment_reminder",
            title: `${expense.name} due ${daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}`,
            message: amountStr
              ? `${expense.name} (${amountStr}) is due on ${dueDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}.`
              : `${expense.name} is due on ${dueDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}.`,
            metadata: {
              expense_id: expense.id,
              expense_name: expense.name,
              due_date: expense.next_due_date,
              amount_cents: expense.expected_amount_cents,
              days_until: daysUntil,
            },
          });
          results.payment_reminders++;
        }
      } catch (err) {
        console.error(`Payment reminder error for user ${profile.id}:`, err);
        results.errors++;
      }
    }
  } catch (err) {
    console.error("Payment reminders batch error:", err);
    results.errors++;
  }

  // --- Weekly Summaries ---
  try {
    const { data: summaryUsers } = await supabase
      .from("profiles")
      .select("id, notification_preferences, ai_provider, ai_api_key, ai_model");

    for (const profile of summaryUsers || []) {
      try {
        if (!profile.ai_api_key) continue;

        const prefs = {
          ...DEFAULT_PREFS,
          ...(profile.notification_preferences || {}),
        } as NotificationPreferences;
        const summaryPrefs = {
          ...DEFAULT_PREFS.weekly_summary,
          ...(prefs.weekly_summary || {}),
        };

        if (!summaryPrefs.enabled) continue;

        // Check day of week and hour
        const userDay = getUserLocalDayOfWeek(summaryPrefs.timezone, now);
        if (userDay !== summaryPrefs.day_of_week) continue;

        const userHour = getUserLocalHour(summaryPrefs.timezone, now);
        const targetHour = parseHour(summaryPrefs.send_time);
        if (userHour !== targetHour) continue;

        // Deduplicate: skip if a weekly_summary was already created today
        const todayStr = now.toISOString().split("T")[0];
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", profile.id)
          .eq("type", "weekly_summary")
          .gte("created_at", `${todayStr}T00:00:00Z`)
          .maybeSingle();

        if (existing) continue;

        // Set up AI model
        const provider = profile.ai_provider || "google";
        const apiKey = profile.ai_api_key;
        let baseModel;

        if (provider === "google") {
          const client = createGoogleGenerativeAI({ apiKey });
          baseModel = client(profile.ai_model || "gemini-2.0-flash");
        } else if (provider === "openai") {
          const client = createOpenAI({ apiKey });
          baseModel = client.chat(profile.ai_model || "gpt-4o-mini");
        } else {
          const client = createAnthropic({ apiKey });
          baseModel = client(profile.ai_model || "claude-sonnet-4-5-20250929");
        }

        const model = wrapLanguageModel({
          model: baseModel,
          middleware: addToolInputExamplesMiddleware(),
        });

        // Get user context
        const { data: accounts } = await supabase
          .from("accounts")
          .select("id")
          .eq("user_id", profile.id)
          .eq("is_active", true);

        const accountIds = (accounts || []).map((a: { id: string }) => a.id);

        const { data: membership } = await supabase
          .from("partnership_members")
          .select("partnership_id")
          .eq("user_id", profile.id)
          .limit(1)
          .maybeSingle();

        const partnershipId = membership?.partnership_id || null;
        const tools = createFinancialTools(supabase, accountIds, partnershipId, profile.id);

        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}`;
        const currentDate = today.toISOString().split("T")[0];

        const { text } = await generateText({
          model,
          tools,
          stopWhen: stepCountIs(10),
          system: `You are PiggyBack, a friendly personal finance assistant. Today is ${currentDate}. Current month is ${currentMonth}. Generate a brief weekly financial summary. Call the tools to get real data — do NOT make up numbers. Be warm and conversational.`,
          prompt:
            "Generate a weekly financial summary for the past 7 days. Include: total spending vs last week, top 3 merchants, any notable transactions, current account balances, and one actionable tip. Keep it under 150 words.",
        });

        if (text) {
          await createNotification(supabase, {
            userId: profile.id,
            type: "weekly_summary",
            title: "Your weekly financial summary",
            message: text,
            metadata: {
              generated_at: now.toISOString(),
              ai_provider: provider,
            },
          });
          results.weekly_summaries++;
        }
      } catch (err) {
        console.error(`Weekly summary error for user ${profile.id}:`, err);
        results.errors++;
      }
    }
  } catch (err) {
    console.error("Weekly summaries batch error:", err);
    results.errors++;
  }

  return NextResponse.json({
    success: true,
    processed_at: now.toISOString(),
    ...results,
  });
}
