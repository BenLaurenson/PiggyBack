"use client";

import { Nunito, DM_Sans } from "next/font/google";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { AISettings } from "@/components/settings/ai-settings";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

export default function AISettingsPage() {
  return (
    <div className={`p-4 md:p-6 lg:p-8 max-w-4xl mx-auto ${nunito.variable} ${dmSans.variable}`}>
      <div className="space-y-1 mb-6">
        <Link
          href="/settings"
          className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="font-[family-name:var(--font-nunito)] text-2xl font-black text-text-primary">
          AI Assistant
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
          Configure PiggyBack AI for spending insights
        </p>
      </div>

      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          <AISettings />
        </CardContent>
      </Card>
    </div>
  );
}
