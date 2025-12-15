"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  Loader2,
  Save,
  ArrowUpDown,
  Trophy,
  CalendarClock,
  Sparkles,
  AlertCircle,
  Info,
} from "lucide-react";

interface NotificationPreferences {
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

const LEAD_DAYS_OPTIONS = [
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
  { value: "5", label: "5 days before" },
  { value: "7", label: "1 week before" },
];

const DAY_OPTIONS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, "0");
  const label =
    i === 0
      ? "12:00 AM"
      : i < 12
        ? `${i}:00 AM`
        : i === 12
          ? "12:00 PM"
          : `${i - 12}:00 PM`;
  return { value: `${hour}:00`, label };
});

const COMMON_TIMEZONES = [
  "Australia/Melbourne",
  "Australia/Sydney",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Australia/Hobart",
  "Australia/Darwin",
  "Pacific/Auckland",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Pacific/Honolulu",
];

function getDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Australia/Melbourne";
  }
}

function formatTimezone(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    const city = tz.split("/").pop()?.replace(/_/g, " ") || tz;
    return `${city} (${tzPart?.value || tz})`;
  } catch {
    return tz;
  }
}

export default function NotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasAiKey, setHasAiKey] = useState(false);
  const supabase = createClient();

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("notification_preferences, ai_api_key")
      .eq("id", user.id)
      .maybeSingle();

    setHasAiKey(!!profile?.ai_api_key);

    if (profile?.notification_preferences) {
      const stored = profile.notification_preferences as Partial<NotificationPreferences>;
      setPrefs({
        price_changes: { ...DEFAULT_PREFS.price_changes, ...(stored.price_changes || {}) },
        goal_milestones: { ...DEFAULT_PREFS.goal_milestones, ...(stored.goal_milestones || {}) },
        payment_reminders: { ...DEFAULT_PREFS.payment_reminders, ...(stored.payment_reminders || {}) },
        weekly_summary: { ...DEFAULT_PREFS.weekly_summary, ...(stored.weekly_summary || {}) },
      });
    } else {
      // Auto-detect timezone for fresh users
      const detectedTz = getDetectedTimezone();
      setPrefs((prev) => ({
        ...prev,
        payment_reminders: { ...prev.payment_reminders, timezone: detectedTz },
        weekly_summary: { ...prev.weekly_summary, timezone: detectedTz },
      }));
    }

    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      await supabase
        .from("profiles")
        .update({ notification_preferences: prefs })
        .eq("id", user.id);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <Loader2
            className="h-8 w-8 animate-spin mx-auto"
            style={{ color: "var(--text-tertiary)" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Link
          href="/settings"
          className="text-sm font-[family-name:var(--font-dm-sans)] flex items-center gap-1 mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <div className="flex items-center gap-2">
          <h1
            className="font-[family-name:var(--font-nunito)] text-3xl font-black"
            style={{ color: "var(--text-primary)" }}
          >
            Notifications
          </h1>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="rounded-full p-1 transition-colors hover:bg-[var(--surface-secondary)]"
                aria-label="Cron setup info"
              >
                <Info className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 text-sm font-[family-name:var(--font-dm-sans)]"
              style={{ color: "var(--text-secondary)" }}
              align="start"
            >
              <p>
                <strong style={{ color: "var(--text-primary)" }}>Scheduled notifications</strong> (Payment Reminders and Weekly Summary) are powered by a Vercel Cron Job that runs hourly.
              </p>
              <p className="mt-2">
                To enable, set the <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: "var(--surface-secondary)" }}>CRON_SECRET</code> environment variable in your Vercel project settings.{" "}
                <a
                  href="https://vercel.com/docs/cron-jobs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--pastel-blue-dark)" }}
                >
                  Learn more
                </a>
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <p
          className="font-[family-name:var(--font-dm-sans)]"
          style={{ color: "var(--text-secondary)" }}
        >
          Choose what you get notified about and when
        </p>
      </div>

      {success && (
        <div
          className="p-4 text-sm rounded-xl mb-6 font-[family-name:var(--font-dm-sans)]"
          style={{
            backgroundColor: "var(--pastel-mint-light)",
            color: "var(--pastel-mint-dark)",
          }}
        >
          Notification preferences saved!
        </div>
      )}

      <div className="space-y-4">
        {/* Subscription Price Changes */}
        <Card style={{ borderColor: "var(--border)" }}>
          <CardContent>
            <div className="flex items-start gap-3">
              <div
                className="p-2 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: "var(--pastel-yellow-light)" }}
              >
                <ArrowUpDown
                  className="h-4 w-4"
                  style={{ color: "var(--pastel-yellow-dark)" }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      className="font-[family-name:var(--font-nunito)] font-bold text-base"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Subscription Price Changes
                    </Label>
                    <p
                      className="font-[family-name:var(--font-dm-sans)] text-sm mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Get notified when a recurring charge changes amount
                    </p>
                  </div>
                  <Switch
                    checked={prefs.price_changes.enabled}
                    onCheckedChange={(checked) =>
                      setPrefs((p) => ({
                        ...p,
                        price_changes: { enabled: checked },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Goal Milestones */}
        <Card style={{ borderColor: "var(--border)" }}>
          <CardContent>
            <div className="flex items-start gap-3">
              <div
                className="p-2 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: "var(--pastel-mint-light)" }}
              >
                <Trophy
                  className="h-4 w-4"
                  style={{ color: "var(--pastel-mint-dark)" }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      className="font-[family-name:var(--font-nunito)] font-bold text-base"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Goal Milestones
                    </Label>
                    <p
                      className="font-[family-name:var(--font-dm-sans)] text-sm mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Celebrate when your savings goals hit 25%, 50%, 75%, and
                      completion
                    </p>
                  </div>
                  <Switch
                    checked={prefs.goal_milestones.enabled}
                    onCheckedChange={(checked) =>
                      setPrefs((p) => ({
                        ...p,
                        goal_milestones: { enabled: checked },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Reminders */}
        <Card style={{ borderColor: "var(--border)" }}>
          <CardContent>
            <div className="flex items-start gap-3">
              <div
                className="p-2 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: "var(--pastel-coral-light)" }}
              >
                <CalendarClock
                  className="h-4 w-4"
                  style={{ color: "var(--pastel-coral-dark)" }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      className="font-[family-name:var(--font-nunito)] font-bold text-base"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Payment Reminders
                    </Label>
                    <p
                      className="font-[family-name:var(--font-dm-sans)] text-sm mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Heads up when bills are due soon
                    </p>
                  </div>
                  <Switch
                    checked={prefs.payment_reminders.enabled}
                    onCheckedChange={(checked) =>
                      setPrefs((p) => ({
                        ...p,
                        payment_reminders: {
                          ...p.payment_reminders,
                          enabled: checked,
                        },
                      }))
                    }
                  />
                </div>

                {/* Schedule controls */}
                {prefs.payment_reminders.enabled && (
                  <div
                    className="mt-4 pt-4 space-y-3"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label
                          className="text-xs font-[family-name:var(--font-dm-sans)] mb-1.5 block"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          Remind me
                        </Label>
                        <Select
                          value={String(prefs.payment_reminders.lead_days)}
                          onValueChange={(val) =>
                            setPrefs((p) => ({
                              ...p,
                              payment_reminders: {
                                ...p.payment_reminders,
                                lead_days: parseInt(val, 10),
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_DAYS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label
                          className="text-xs font-[family-name:var(--font-dm-sans)] mb-1.5 block"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          At
                        </Label>
                        <Select
                          value={prefs.payment_reminders.send_time}
                          onValueChange={(val) =>
                            setPrefs((p) => ({
                              ...p,
                              payment_reminders: {
                                ...p.payment_reminders,
                                send_time: val,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HOUR_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label
                          className="text-xs font-[family-name:var(--font-dm-sans)] mb-1.5 block"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          Timezone
                        </Label>
                        <Select
                          value={prefs.payment_reminders.timezone}
                          onValueChange={(val) =>
                            setPrefs((p) => ({
                              ...p,
                              payment_reminders: {
                                ...p.payment_reminders,
                                timezone: val,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_TIMEZONES.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {formatTimezone(tz)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Summary */}
        <Card style={{ borderColor: "var(--border)" }}>
          <CardContent>
            <div className="flex items-start gap-3">
              <div
                className="p-2 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: "var(--pastel-lavender-light)" }}
              >
                <Sparkles
                  className="h-4 w-4"
                  style={{ color: "var(--pastel-lavender-dark)" }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      className="font-[family-name:var(--font-nunito)] font-bold text-base"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Weekly Summary
                    </Label>
                    <p
                      className="font-[family-name:var(--font-dm-sans)] text-sm mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      AI-generated overview of your week's finances
                    </p>
                  </div>
                  <Switch
                    checked={prefs.weekly_summary.enabled}
                    onCheckedChange={(checked) =>
                      setPrefs((p) => ({
                        ...p,
                        weekly_summary: {
                          ...p.weekly_summary,
                          enabled: checked,
                        },
                      }))
                    }
                    disabled={!hasAiKey}
                  />
                </div>

                {!hasAiKey && (
                  <div
                    className="mt-3 flex items-center gap-2 text-xs font-[family-name:var(--font-dm-sans)]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      Requires an AI key —{" "}
                      <Link
                        href="/settings/ai"
                        className="underline"
                        style={{ color: "var(--pastel-blue-dark)" }}
                      >
                        configure in AI settings
                      </Link>
                    </span>
                  </div>
                )}

                {/* Schedule controls */}
                {prefs.weekly_summary.enabled && hasAiKey && (
                  <div
                    className="mt-4 pt-4 space-y-3"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label
                          className="text-xs font-[family-name:var(--font-dm-sans)] mb-1.5 block"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          Day
                        </Label>
                        <Select
                          value={prefs.weekly_summary.day_of_week}
                          onValueChange={(val) =>
                            setPrefs((p) => ({
                              ...p,
                              weekly_summary: {
                                ...p.weekly_summary,
                                day_of_week: val,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label
                          className="text-xs font-[family-name:var(--font-dm-sans)] mb-1.5 block"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          At
                        </Label>
                        <Select
                          value={prefs.weekly_summary.send_time}
                          onValueChange={(val) =>
                            setPrefs((p) => ({
                              ...p,
                              weekly_summary: {
                                ...p.weekly_summary,
                                send_time: val,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HOUR_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label
                          className="text-xs font-[family-name:var(--font-dm-sans)] mb-1.5 block"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          Timezone
                        </Label>
                        <Select
                          value={prefs.weekly_summary.timezone}
                          onValueChange={(val) =>
                            setPrefs((p) => ({
                              ...p,
                              weekly_summary: {
                                ...p.weekly_summary,
                                timezone: val,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_TIMEZONES.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {formatTimezone(tz)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 rounded-xl font-[family-name:var(--font-nunito)] font-bold"
          style={{
            backgroundColor: "var(--pastel-blue)",
            color: "white",
          }}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Preferences
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
