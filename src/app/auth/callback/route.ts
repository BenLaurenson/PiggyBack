import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Phase 4 funnel: google_signed_in fires when the OAuth provider
      // is Google. (The provider is in app_metadata.provider after the
      // Supabase code exchange.) Other providers and email-confirmation
      // flows don't fire this event — those are covered by signup_started
      // and tenant_ready.
      const provider = (data?.user?.app_metadata as { provider?: string } | undefined)
        ?.provider;
      if (provider === "google" && data?.user?.id) {
        void track(FunnelEvent.GOOGLE_SIGNED_IN, {
          userId: data.user.id,
          tenantId: data.user.id,
          properties: {
            provider,
            email: data.user.email ?? null,
          },
        });
      }
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }

      // Validate forwardedHost against known domains
      const allowedHosts = [
        process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      ].filter(Boolean);

      if (forwardedHost && allowedHosts.includes(forwardedHost)) {
        return NextResponse.redirect(`https://${forwardedHost}${safeNext}`);
      } else {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
