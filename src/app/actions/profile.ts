"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";

/**
 * Update user profile (display name, avatar).
 * Server-side validation ensures only whitelisted fields are written.
 */
export async function updateProfile(data: {
  display_name: string;
  avatar_url?: string | null;
}) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const displayName = data.display_name?.trim();
  if (!displayName) {
    return { error: "Display name is required" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      avatar_url: data.avatar_url || null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to update profile") };
  }

  revalidatePath("/settings/profile");
  revalidatePath("/settings");
  return { success: true };
}

/**
 * Update theme preference.
 */
export async function updateThemePreference(theme: string) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const validThemes = ["mint", "light", "dark", "ocean"];
  if (!validThemes.includes(theme)) {
    return { error: "Invalid theme" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ theme_preference: theme })
    .eq("id", user.id);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to save theme") };
  }

  return { success: true };
}

/**
 * Update notification preferences.
 *
 * Uses an atomic JSONB merge (PostgreSQL || operator) via RPC to prevent
 * race conditions when two concurrent requests modify different preference
 * keys. Each top-level key (e.g., price_changes, payment_reminders) is
 * replaced atomically while preserving other keys.
 */
export async function updateNotificationPreferences(prefs: Record<string, unknown>) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  if (!prefs || typeof prefs !== "object") {
    return { error: "Invalid preferences" };
  }

  // Atomic merge: uses PostgreSQL's || operator so concurrent writes to
  // different preference keys don't clobber each other.
  const { error } = await supabase.rpc("merge_notification_preferences", {
    p_user_id: user.id,
    p_prefs: prefs,
  });

  if (error) {
    return { error: safeErrorMessage(error, "Failed to save notification preferences") };
  }

  revalidatePath("/settings/notifications");
  return { success: true };
}

/**
 * Disconnect UP Bank by deactivating the API config.
 */
export async function disconnectUpBank() {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("up_api_configs")
    .update({ is_active: false })
    .eq("user_id", user.id);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to disconnect from UP Bank") };
  }

  revalidatePath("/settings/up-connection");
  revalidatePath("/settings");
  return { success: true };
}
