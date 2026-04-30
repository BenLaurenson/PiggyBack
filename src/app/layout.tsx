import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { EnvironmentBanner } from "@/components/environment-banner";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PiggyBack",
  description:
    "Your data lives in your Supabase. Your app runs on your Vercel. The first finance app that's genuinely yours — auto-syncing with Up Bank, with an AI assistant that respects your data. Cancel anytime, keep what you built. MIT licensed.",
  keywords: [
    "personal finance",
    "Up Bank",
    "budget tracker",
    "auto sync transactions",
    "self-hosted",
    "open source",
    "savings goals",
    "AI finance assistant",
    "Next.js",
    "Supabase",
  ],
  authors: [{ name: "Ben Laurenson" }],
  openGraph: {
    title: "PiggyBack",
    description:
      "Your data lives in your Supabase. Your app runs on your Vercel. The first finance app that's genuinely yours — auto-syncing with Up Bank.",
    type: "website",
    locale: "en_AU",
    siteName: "PiggyBack",
    images: [{ url: "/PiggyBackIcon.png", width: 512, height: 512, alt: "PiggyBack - Penny and Buck mascots" }],
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  twitter: {
    card: "summary_large_image",
    title: "PiggyBack",
    description:
      "Your data lives in your Supabase. Your app runs on your Vercel. Cancel anytime, keep what you built.",
    images: ["/PiggyBackIcon.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="en" nonce={nonce}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <EnvironmentBanner />
        <AnalyticsProvider>{children}</AnalyticsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
