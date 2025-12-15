import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

/**
 * GET /api/notifications
 * Fetch notifications for the authenticated user.
 *
 * Query params:
 *   unread_only (optional) - "true" to only return unread notifications
 *   limit (optional) - max number of notifications to return (default 20)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread_only") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

  // Fetch notifications
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq("read", false);
  }

  const { data: notifications, error } = await query;

  if (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }

  // Get unread count
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  return NextResponse.json({
    notifications: notifications || [],
    unread_count: unreadCount || 0,
  });
}

/**
 * PATCH /api/notifications
 * Mark notifications as read.
 *
 * Body:
 *   { notification_ids: string[] } - mark specific notifications as read
 *   OR { mark_all_read: true } - mark all notifications as read
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const notificationSchema = z.union([
    z.object({
      mark_all_read: z.literal(true),
      notification_ids: z.array(z.string().uuid()).max(200).optional(),
    }),
    z.object({
      mark_all_read: z.literal(false).optional(),
      notification_ids: z.array(z.string().uuid()).min(1).max(200),
    }),
  ]);
  const parsed = await parseBody(request, notificationSchema);
  if (parsed.response) return parsed.response;
  const { notification_ids, mark_all_read } = parsed.data;

  if (mark_all_read) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      return NextResponse.json(
        { error: "Failed to mark all as read" },
        { status: 500 }
      );
    }
  } else if (notification_ids) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .in("id", notification_ids);

    if (error) {
      return NextResponse.json(
        { error: "Failed to mark as read" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
