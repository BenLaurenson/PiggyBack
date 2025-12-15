import type { NextConfig } from "next";

// CSP is set dynamically in middleware.ts with per-request nonces (see M2/M184 fixes).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
    // M86: Restrict image optimization to prevent SSRF via /_next/image?url=
    // No next/image components use remote URLs, so block all remote sources.
    remotePatterns: [],
  },
  experimental: {
    staleTimes: {
      dynamic: 180, // 3 min client-side Router Cache for dynamic pages (default: 30s)
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // M62: Prevent caching of sensitive API responses
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
