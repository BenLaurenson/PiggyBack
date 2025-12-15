import Link from "next/link";
import Image from "next/image";
import { Nunito, DM_Sans } from "next/font/google";
import {
  Github,
  Heart,
  Lightbulb,
  Play,
  Coffee,
  Linkedin,
  Globe,
  ExternalLink,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";

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

export const metadata: Metadata = {
  title: "About - PiggyBack",
  description:
    "The story behind PiggyBack. Your finances on autopilot with Up Bank.",
};

export default function AboutPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-20">
          <h1 className="font-[family-name:var(--font-nunito)] text-5xl md:text-6xl font-black text-text-primary mb-6">
            About PiggyBack
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-lg text-text-label max-w-2xl mx-auto leading-relaxed">
            Your finances on autopilot with Up Bank. Self-hosted on your own
            infrastructure.
          </p>
        </div>

        {/* About the Developer */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Coffee className="w-6 h-6 text-pastel-lavender-dark" />
            <h2 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
              About the Developer
            </h2>
          </div>
          <div className="relative overflow-hidden bg-surface-white-60 rounded-[2rem] border-2 border-border-white-80 p-8 md:p-10">
            <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
              {/* Photo + Social Links */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-pastel-lavender/30 rounded-full blur-xl scale-110" />
                  <Image
                    src="/images/ben-laurenson.jpg"
                    alt="Ben Laurenson"
                    width={160}
                    height={160}
                    className="relative w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-lg"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href="https://github.com/BenLaurenson"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 bg-white rounded-full flex items-center justify-center border border-border-light hover:border-border-medium hover:scale-110 transition-all duration-200 cursor-pointer"
                    aria-label="GitHub"
                  >
                    <Github className="w-4 h-4 text-text-medium" />
                  </a>
                  <a
                    href="https://www.linkedin.com/in/ben-laurenson-4400972bb/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 bg-white rounded-full flex items-center justify-center border border-border-light hover:border-border-medium hover:scale-110 transition-all duration-200 cursor-pointer"
                    aria-label="LinkedIn"
                  >
                    <Linkedin className="w-4 h-4 text-text-medium" />
                  </a>
                  <a
                    href="https://benlaurenson.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 bg-white rounded-full flex items-center justify-center border border-border-light hover:border-border-medium hover:scale-110 transition-all duration-200 cursor-pointer"
                    aria-label="Portfolio"
                  >
                    <Globe className="w-4 h-4 text-text-medium" />
                  </a>
                </div>
              </div>

              {/* Bio + BMC */}
              <div>
                <h3 className="font-[family-name:var(--font-nunito)] text-2xl font-black text-text-primary mb-1">
                  Ben Laurenson
                </h3>
                <p className="font-[family-name:var(--font-dm-sans)] text-sm text-pastel-lavender-dark font-medium mb-4">
                  AI Engineer · Perth, Australia
                </p>
                <div className="space-y-3 font-[family-name:var(--font-dm-sans)] text-text-secondary leading-relaxed mb-6">
                  <p>
                    I wanted an app that synced transactions automatically from
                    Up Bank, showed me dashboards and graphs of where my money
                    goes, and gave my partner and I a way to budget together for
                    our future. Nothing like that existed, so I built it.
                  </p>
                </div>

                {/* Buy Me a Coffee */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href="https://buymeacoffee.com/benlaurenson"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-sm bg-[#FFDD00] hover:bg-[#FFDD00]/90 text-[#000000] px-5 py-2.5 rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg cursor-pointer"
                  >
                    <Coffee className="w-4 h-4" />
                    Buy Me a Coffee
                  </a>
                  <a
                    href="https://benlaurenson.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-sm bg-white hover:bg-gray-50 text-text-medium border border-border-medium px-5 py-2.5 rounded-full transition-all duration-200 hover:scale-105 cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View Portfolio
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Story */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Lightbulb className="w-6 h-6 text-warning-dark" />
            <h2 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
              The Story
            </h2>
          </div>
          <div className="font-[family-name:var(--font-dm-sans)] text-text-medium leading-relaxed space-y-4">
            <p>
              My partner and I both use Up Bank. We wanted a shared view of our
              spending, something that could split bills by income ratio and show
              us where our money actually goes. Nothing existed for Up Bank, so I
              started building one.
            </p>
            <p>
              Most finance apps are SaaS products that store your data on their
              servers. Up Bank&apos;s API terms don&apos;t allow that, so
              PiggyBack takes a different approach: you deploy it on your own
              Vercel + Supabase stack. Your financial data stays in your own
              database. Nobody else has access.
            </p>
            <p>
              What started as a weekend project turned into a full-featured app
              with zero-based budgeting, a 25-tool AI assistant, real-time
              webhook sync, smart categorization, and proper couples support with
              income-proportional splitting.
            </p>
          </div>
        </section>

        {/* Meet Penny & Buck */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Heart className="w-6 h-6 text-brand-coral" />
            <h2 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
              Meet Penny &amp; Buck
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="font-[family-name:var(--font-dm-sans)] text-text-medium leading-relaxed space-y-4">
              <p>
                Penny and Buck are the PiggyBack mascots. Buck is the bigger pig
                who carries Penny on his back. He&apos;s the steady one. Penny
                is always looking forward, pointing at the next goal.
              </p>
              <p>
                The name is a triple meaning: <strong>piggy</strong> (the
                classic piggy bank), <strong>back</strong> (having each
                other&apos;s backs financially), and <strong>piggyback</strong>{" "}
                (the playful act of carrying, like partnership).
              </p>
              <p>
                They show up throughout the app. Penny is also the name of the
                AI assistant, which has 29 financial tools and can answer
                questions about your spending, create budgets, and track goals.
              </p>
            </div>
            <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-6 border-2 border-border-white-60 shadow-lg">
              <Image
                src="/images/mascot/piggyback-heart.png"
                alt="Penny and Buck holding a heart together"
                width={400}
                height={400}
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </section>

        {/* Try the Demo */}
        <section className="mb-20">
          <div className="relative overflow-hidden bg-gradient-to-br from-gradient-coral-start to-gradient-coral-end rounded-[2rem] p-10 md:p-12 text-center">
            <div className="relative z-10">
              <h2 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-white mb-3">
                See it in action
              </h2>
              <p className="font-[family-name:var(--font-dm-sans)] text-base text-white/80 mb-6 max-w-lg mx-auto">
                The full app is running live with sample data. Poke around,
                check out the dashboards, and see how it all fits together.
              </p>
              <a
                href="/home"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-white hover:bg-gray-50 text-brand-coral-hover px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-xl cursor-pointer"
              >
                <Play className="w-5 h-5" />
                Try the Live Demo
              </a>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
