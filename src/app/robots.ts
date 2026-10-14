import type { MetadataRoute } from "next";

// App routes serve the signed-in dashboard (demo data on piggyback.finance),
// so only the landing, about, docs and legal pages are for search engines.
const APP_ROUTES = [
  "/api/",
  "/auth/",
  "/home",
  "/settings",
  "/goals",
  "/plan",
  "/activity",
  "/budget",
  "/invest",
  "/onboarding",
  "/analysis",
  "/notifications",
  "/dev",
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: APP_ROUTES },
    sitemap: "https://piggyback.finance/sitemap.xml",
  };
}
