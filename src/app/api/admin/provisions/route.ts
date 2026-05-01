/**
 * Admin API for provisions list.
 *
 * GET /api/admin/provisions       — paginated list (admin auth required)
 * POST /api/admin/provisions      — body: { id, action: 'retry' | 'cancel' }
 *
 * Auth: cookies-based admin login OR Bearer CRON_SECRET (for scripts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { audit } from "@/lib/provisioner/state-machine";

export const runtime = "nodejs";

function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdminRequest(request: NextRequest): Promise<boolean> {
  // Bearer secret bypass for tooling
  if (request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    return Boolean(email && adminEmails().includes(email));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25)));
  const stateFilter = url.searchParams.get("state");

  const supabase = createServiceRoleClient();
  let query = supabase
    .from("piggyback_provisions")
    .select(
      "id, email, display_name, state, retry_count, next_retry_at, state_changed_at, subdomain_short_id, vercel_deployment_url",
      { count: "exact" }
    )
    .order("state_changed_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (stateFilter) {
    query = query.eq("state", stateFilter);
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data, count, page, pageSize });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as
    | { id?: string; action?: "retry" | "cancel" }
    | null;
  if (!body?.id || !body.action) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (body.action === "retry") {
    // Clear next_retry_at to make the worker pick it up immediately, and
    // restore from FAILED_RETRYABLE/FAILED_PERMANENT to last_failure_state
    // if known.
    const { data: row } = await supabase
      .from("piggyback_provisions")
      .select("state, state_data")
      .eq("id", body.id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const stateData = (row.state_data as Record<string, unknown>) ?? {};
    const resumeTo = (stateData.last_failure_state as string | undefined) ?? row.state;
    await supabase
      .from("piggyback_provisions")
      .update({
        state: resumeTo,
        retry_count: 0,
        next_retry_at: null,
      })
      .eq("id", body.id);
    await audit(body.id, "ADMIN_RETRY", { resumeTo });
    return NextResponse.json({ ok: true, resumeTo });
  }

  if (body.action === "cancel") {
    await supabase
      .from("piggyback_provisions")
      .update({ state: "CANCELLED" })
      .eq("id", body.id);
    await audit(body.id, "ADMIN_CANCELLED");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
