import Link from "next/link";
import Image from "next/image";
import { Nunito, DM_Sans } from "next/font/google";
import {
  Github,
  ChevronRight,
  Star,
  Scale,
  Database,
  Eye,
  Server,
  Lock,
  BookOpen,
  Play,
} from "lucide-react";
import { LandingClient } from "@/components/landing/landing-client";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { isDemoMode } from "@/lib/demo-guard";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"],
});

const GITHUB_URL = "https://github.com/BenLaurenson/PiggyBack";

export default function LandingPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      {/* ===================== HEADER ===================== */}
      <LandingHeader />

      {/* ===================== HERO ===================== */}
      <section className="relative pt-16 md:pt-24 pb-12 px-4 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Text */}
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-accent-amber-light border border-accent-amber-border px-4 py-1.5 rounded-full mb-6">
                <Scale className="w-3.5 h-3.5 text-warning-dark" />
                <span className="font-[family-name:var(--font-dm-sans)] font-medium text-xs text-text-medium">
                  Auto-Syncing · Open Source · MIT Licensed
                </span>
              </div>

              <h1 className="font-[family-name:var(--font-nunito)] text-4xl md:text-5xl lg:text-6xl font-black text-text-primary leading-tight mb-5">
                Your finances on autopilot with{" "}
                <span className="inline-flex items-baseline gap-2 text-brand-coral">
                  Up Bank
                  <Image src="/images/up-bank-logo.jpg" alt="Up Bank logo" width={120} height={120} className="w-8 h-8 md:w-10 md:h-10 self-center translate-y-1 inline-block" />
                </span>
              </h1>

              <p className="font-[family-name:var(--font-dm-sans)] text-base md:text-lg text-text-label leading-relaxed mb-8 max-w-lg">
                Track spending, split bills with your partner, and let a 25-tool
                AI assistant handle the boring stuff. Runs on your own Vercel +
                Supabase stack.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                {isDemoMode() ? (
                  <Link
                    href="/home"
                    className="group font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark text-white px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-shadow-coral-strong flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Try Live Demo
                  </Link>
                ) : (
                  <Link
                    href="/docs"
                    className="group font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark text-white px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-shadow-coral-strong flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Deploy Your Own
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                  </Link>
                )}
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-[family-name:var(--font-nunito)] font-bold text-base bg-surface-white-60 hover:bg-white border-2 border-border-medium text-text-medium px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Github className="w-4 h-4" />
                  View on GitHub
                </a>
              </div>

              {!isDemoMode() && (
                <a
                  href="/home"
                  className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary hover:text-brand-coral transition-colors duration-200 inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  or try the live demo
                </a>
              )}

              {/* Trust Row */}
              <div className="flex flex-wrap items-center gap-3">
                {["Next.js 16", "React 19", "Supabase", "Up Bank", "TypeScript"].map(
                  (badge) => (
                    <span
                      key={badge}
                      className="font-[family-name:var(--font-dm-sans)] text-xs font-medium text-text-tertiary bg-surface-white-60 border border-border-light px-2.5 py-1 rounded-full"
                    >
                      {badge}
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Right - Browser Mockup with Live Preview */}
            <LandingClient feature="hero" />
          </div>
        </div>
      </section>

      {/* ===================== FEATURE SHOWCASE ===================== */}
      <LandingClient feature="features" />

      {/* ===================== BENTO GRID ===================== */}
      <LandingClient feature="bento" />

      {/* ===================== WHY SELF-HOST ===================== */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-accent-teal uppercase tracking-wider mb-2">
                Self-Hosted by Design
              </p>
              <h2 className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black text-text-primary mb-4">
                Why is this self-hosted?
              </h2>
              <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-6 leading-relaxed">
                Australian banking regulations and Up Bank&apos;s API terms
                don&apos;t allow third parties to store your banking credentials.
                PiggyBack can&apos;t exist as a SaaS, so you run it yourself on
                your own infrastructure with your own API keys.
              </p>
              <ul className="space-y-3">
                {[
                  { icon: Lock, text: "Banking regulations require you to control your own tokens" },
                  { icon: Database, text: "Your data lives in your own Supabase database" },
                  { icon: Server, text: "Runs on your Vercel account (free tier works)" },
                  { icon: Scale, text: "MIT licensed. Fork it, change it, make it yours." },
                  { icon: Eye, text: "No middleman between you and your bank" },
                ].map((benefit) => (
                  <li
                    key={benefit.text}
                    className="flex items-center gap-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-medium"
                  >
                    <span className="w-7 h-7 bg-accent-teal-light rounded-lg flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="w-3.5 h-3.5 text-accent-teal" />
                    </span>
                    {benefit.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-accent-teal-light rounded-[2rem] blur-2xl" />
              <div className="relative bg-surface-white-60 rounded-[2rem] p-8 border-2 border-border-white-80">
                <div className="text-center">
                  <Image
                    src="/images/mascot/buck-shield.png"
                    alt="Buck in protective stance"
                    width={80}
                    height={80}
                    className="mx-auto mb-4 object-contain"
                  />
                  <h3 className="font-[family-name:var(--font-nunito)] font-black text-xl text-text-primary mb-2">
                    You Own the Whole Stack
                  </h3>
                  <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-sm mb-5">
                    Your database. Your hosting. Your keys. Nobody else touches
                    your bank data.
                  </p>
                  <div className="space-y-2.5">
                    {[
                      { label: "Database", value: "Your Supabase" },
                      { label: "Hosting", value: "Your Vercel" },
                      { label: "API Keys", value: "Your env vars" },
                      { label: "Source Code", value: "MIT Licensed" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex justify-between items-center bg-white/60 rounded-xl px-4 py-2.5"
                      >
                        <span className="font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary">
                          {item.label}
                        </span>
                        <span className="font-[family-name:var(--font-nunito)] font-bold text-sm text-accent-teal">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section id="how-it-works" className="py-16 md:py-24 px-4 bg-white/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-brand-coral-hover uppercase tracking-wider mb-2">
              Get Started in Minutes
            </p>
            <h2 className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black text-text-primary">
              Three steps to deploy
            </h2>
          </div>

          <LandingClient feature="how-it-works" />
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden bg-gradient-to-br from-gradient-coral-start to-gradient-coral-end rounded-[2rem] p-10 md:p-14 text-center">
            <div className="relative z-10">
              <div className="w-24 h-24 mx-auto mb-5">
                <Image
                  src="/images/mascot/piggyback-celebrating.png"
                  alt="Penny and Buck celebrating"
                  width={96}
                  height={96}
                  className="w-full h-full object-contain"
                />
              </div>
              <h2 className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black text-white mb-3">
                Deploy PiggyBack in 15 minutes
              </h2>
              <p className="font-[family-name:var(--font-dm-sans)] text-base text-white/80 mb-8 max-w-lg mx-auto">
                Fork the repo, set up Supabase, deploy to Vercel. The guide
                walks you through every step.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/home"
                  className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-white hover:bg-gray-50 text-brand-coral-hover px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-xl cursor-pointer"
                >
                  <Play className="w-5 h-5" />
                  Try Live Demo
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-transparent border-2 border-white/40 hover:border-white text-white px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 cursor-pointer"
                >
                  <BookOpen className="w-5 h-5" />
                  Documentation
                </Link>
              </div>
              <div className="mt-5">
                <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-dm-sans)] text-sm text-white/60">
                  <Scale className="w-3.5 h-3.5" />
                  MIT License
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <LandingFooter />
    </div>
  );
}
