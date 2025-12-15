import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
            supabaseResponse.cookies.set(name, value, options)
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
      { status: 200 }
    );
  }

  // If a Supabase auth code lands on the wrong path (e.g. Site URL misconfiguration),
  // redirect to /auth/callback so the code exchange happens properly
  const authCode = request.nextUrl.searchParams.get("code");
  if (authCode && !request.nextUrl.pathname.startsWith("/auth/callback")) {
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
    const { data } = await supabase.auth.signInWithPassword({
      email: process.env.DEMO_USER_EMAIL!,
      password: process.env.DEMO_USER_PASSWORD!,
    });
    user = data.user;
  }

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ["/home", "/settings", "/goals", "/plan", "/activity", "/budget", "/invest", "/onboarding"];
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
