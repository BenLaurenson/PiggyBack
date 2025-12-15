import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...options, httpOnly: true })
          );
        },
      },
    }
  );

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  // Demo mode: block all API mutations (non-GET requests)
  if (isDemoMode && request.nextUrl.pathname.startsWith("/api/") && request.method !== "GET") {
    return NextResponse.json(
      { error: "Demo mode — changes are not saved.", demo: true },
      { status: 403 }
    );
  }

  // Demo mode: also block server action mutations (POST with Next-Action header)
  if (isDemoMode && request.method === "POST" && request.headers.get("next-action")) {
    return NextResponse.json({ error: "Mutations disabled in demo mode" }, { status: 403 });
  }

  // If a Supabase auth code lands on the wrong path (e.g. Site URL misconfiguration),
  // redirect to /auth/callback so the code exchange happens properly
  // Only redirect from root or known safe paths, not every URL
  const safeCodePaths = ["/", "/home", "/login", "/signup"];
  const authCode = request.nextUrl.searchParams.get("code");
  if (authCode && !request.nextUrl.pathname.startsWith("/auth/callback")
      && safeCodePaths.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  // Refresh the auth token
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // Demo mode: auto-sign-in as demo user if no session exists
  if (isDemoMode && !user) {
    const demoEmail = process.env.DEMO_USER_EMAIL;
    const demoPassword = process.env.DEMO_USER_PASSWORD;
    if (!demoEmail || !demoPassword) {
      throw new Error("Missing required demo environment variables: DEMO_USER_EMAIL, DEMO_USER_PASSWORD");
    }
    const { data } = await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });
    user = data.user;
  }

  // API routes that handle their own auth (webhook uses HMAC, cron uses CRON_SECRET)
  const selfAuthenticatedPaths = ["/api/upbank/webhook", "/api/cron/notifications"];
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const isSelfAuthenticated = selfAuthenticatedPaths.some(p => request.nextUrl.pathname.startsWith(p));

  // Protect API routes at middleware level (defense-in-depth)
  if (isApiRoute && !isSelfAuthenticated && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CSRF protection: verify Origin header for mutation requests
  const isMutation = request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS";
  const isServerAction = request.method === "POST" && !!request.headers.get("next-action");
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth/signout");
  const needsCsrfCheck = isMutation && (isApiRoute || isServerAction || isAuthRoute);

  if (needsCsrfCheck && !isSelfAuthenticated) {
    const origin = request.headers.get("origin");
    // M174: Derive appUrl from Host header when NEXT_PUBLIC_APP_URL is unset
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const appUrl = configuredAppUrl || (() => {
      const host = request.headers.get("host");
      if (!host) return null;
      const proto = request.headers.get("x-forwarded-proto") || "https";
      return `${proto}://${host}`;
    })();

    if (origin) {
      // Origin is present — verify it matches the app URL (exact origin comparison to prevent prefix bypass)
      if (appUrl && new URL(origin).origin !== new URL(appUrl).origin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // M50: Origin is absent — use Sec-Fetch-Site as fallback
      const secFetchSite = request.headers.get("sec-fetch-site");
      if (secFetchSite === "cross-site") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ["/home", "/settings", "/goals", "/plan", "/activity", "/budget", "/invest", "/onboarding", "/analysis", "/notifications", "/dev"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (
    isProtectedPath &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users from login/signup to home (and landing page if SKIP_LANDING is set)
  const skipLanding = process.env.NEXT_PUBLIC_SKIP_LANDING === "true";
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup" || (skipLanding && request.nextUrl.pathname === "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  // Self-deployed instances: skip landing page entirely, send unauthenticated users to login
  if (skipLanding && !user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect users who haven't completed onboarding (skip in demo mode)
  if (!isDemoMode && user && isProtectedPath && !request.nextUrl.pathname.startsWith("/onboarding")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("has_onboarded")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && profile.has_onboarded === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
