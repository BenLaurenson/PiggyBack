import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Generate a per-request nonce for CSP (M2: replaces unsafe-inline)
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://vercel.live${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL || ''} https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://vercel.live`,
    "object-src 'none'",       // M184: block plugin-based content
    "base-uri 'self'",         // M184: restrict <base> element
    "frame-ancestors 'none'",  // M184: prevent framing
    "form-action 'self'",
  ];
  const cspHeaderValue = cspDirectives.join("; ");

  // Pass the nonce to Next.js via the request header so it can apply it to inline scripts
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", cspHeaderValue);

  const response = await updateSession(request);

  // Apply CSP to the outgoing response
  response.headers.set("Content-Security-Policy", cspHeaderValue);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
