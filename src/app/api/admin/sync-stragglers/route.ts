import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { runSyncForUser } from "@/lib/sync/runner";

/**
 * GET /api/admin/sync-stragglers
 *
 * Returns all accounts whose sync_state is anything other than CURRENT
 * or IDLE (i.e., SYNCING/STALE_PARTIAL/SYNC_FAILED_PERMANENT). Used by
 * the admin observability page at /admin/sync-stragglers.
 *
 * Authorisation: env-var allowlist (ADMIN_EMAILS, comma-separated). The
 * absence of a real admin role on `profiles` is intentional for the
 * single-tenant dev project; Plan #1 introduces orchestrator-vs-tenant
 * role-context which can replace this guard later.
 *
 * POST /api/admin/sync-stragglers — body { userId } — manually triggers
 * a sync for a specific user (admin nudge).
 */

function isAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceRoleClient();
  // This is a tenant-side admin observability route, not orchestrator-only.
  // The lint rule covers all of src/app/api/admin/** because most admin
  // paths there are orchestrator-only; this route is the exception.
  // eslint-disable-next-line no-restricted-syntax
  const { data: accounts, error } = await service
    .from("accounts")
    .select(
      "id, user_id, display_name, sync_state, last_synced_at, sync_error_count, sync_last_error, sync_started_at"
    )
    .in("sync_state", ["SYNCING", "STALE_PARTIAL", "SYNC_FAILED_PERMANENT"])
    .order("sync_error_count", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with user email (best-effort).
  const userIds = [...new Set((accounts ?? []).map((a) => a.user_id))];
  const emailByUserId = new Map<string, string>();
  for (const id of userIds) {
    const { data: prof } = await service
      .from("profiles")
      .select("email")
      .eq("id", id)
      .maybeSingle();
    if (prof?.email) emailByUserId.set(id, prof.email);
  }

  const enriched = (accounts ?? []).map((a) => ({
    ...a,
    user_email: emailByUserId.get(a.user_id) ?? null,
  }));

  return NextResponse.json({ stragglers: enriched });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetUserId = body.userId;
  if (!targetUserId || typeof targetUserId !== "string") {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Best-effort manual reconciliation for one user.
  const result = await runSyncForUser({
    userId: targetUserId,
    trigger: "reconciliation_cron",
  });

  return NextResponse.json({ success: result.ok, result });
}
