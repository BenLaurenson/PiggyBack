import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },
  experimental: {
    staleTimes: {
      dynamic: 180, // 3 min client-side Router Cache for dynamic pages (default: 30s)
    },
  },
};

export default nextConfig;
