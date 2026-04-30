/**
 * Email-capture endpoint for the landing-page "notify me" form.
 *
 * Stores the email in the launch_subscribers table on the orchestrator
 * Supabase. Cheap and good enough — we'll wire to a proper ESP later.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  let email: string | null = null;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    email = (body as { email?: string }).email ?? null;
  } else {
    // application/x-www-form-urlencoded from the landing page form
    const form = await request.formData();
    email = (form.get("email") as string | null) ?? null;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (contentType.includes("application/json")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    // Form post: redirect with error param
    return NextResponse.redirect(new URL("/?notify=error", request.url));
  }

  const supabase = createServiceRoleClient();
  await supabase
    .from("launch_subscribers")
    .upsert(
      { email: email.toLowerCase(), source: "landing-hero", subscribed_at: new Date().toISOString() },
      { onConflict: "email" }
    );

  if (contentType.includes("application/json")) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.redirect(new URL("/?notify=ok", request.url));
}
