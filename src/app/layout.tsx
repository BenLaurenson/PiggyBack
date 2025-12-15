import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
    "Your finances on autopilot with Up Bank. Auto-syncing transactions, budgets, savings goals, and a 25-tool AI assistant. Self-hosted on Vercel + Supabase. MIT licensed.",
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
      "Your finances on autopilot with Up Bank. Auto-syncing transactions, budgets, savings goals, and a 25-tool AI assistant. Self-hosted on Vercel + Supabase.",
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
      "Your finances on autopilot with Up Bank. Auto-syncing transactions, budgets, savings goals, and a 25-tool AI assistant. MIT licensed.",
    images: ["/PiggyBackIcon.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
