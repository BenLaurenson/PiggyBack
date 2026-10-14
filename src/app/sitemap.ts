import type { MetadataRoute } from "next";

const BASE = "https://piggyback.finance";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { path: "/", priority: 1 },
    { path: "/about", priority: 0.7 },
    { path: "/docs", priority: 0.8 },
    { path: "/docs/deploy-cloud", priority: 0.7 },
    { path: "/docs/deploy-local", priority: 0.7 },
    { path: "/docs/configuration", priority: 0.6 },
    { path: "/docs/security", priority: 0.5 },
    { path: "/docs/contributing", priority: 0.5 },
    { path: "/friends", priority: 0.4 },
    { path: "/privacy", priority: 0.3 },
    { path: "/terms", priority: 0.3 },
  ].map(({ path, priority }) => ({
    url: `${BASE}${path}`,
    changeFrequency: "monthly" as const,
    priority,
  }));
}
