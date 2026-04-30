import Link from "next/link";
import Image from "next/image";
import { Nunito, DM_Sans } from "next/font/google";
import {
  Github,
  ChevronRight,
  BookOpen,
  Scale,
  Database,
  Server,
  Lock,
  Eye,
} from "lucide-react";
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

const GITHUB_URL = "https://github.com/BenLaurenson/PiggyBack";

export const metadata = {
  title: "Self-host PiggyBack — free and open-source",
  description:
    "PiggyBack is MIT licensed. Fork it, deploy it on your own Supabase + Vercel, run it forever for free.",
};

const STEPS = [
  {
    n: 1,
    title: "Fork the repo",
    body: "Click Fork on GitHub, or clone locally with `git clone`.",
  },
  {
    n: 2,
    title: "Create a Supabase project",
    body:
      "Free tier works fine. Run the migrations in supabase/migrations/ via the SQL editor or the Supabase CLI.",
  },
  {
    n: 3,
    title: "Deploy to Vercel",
    body:
      "Click Deploy on Vercel and link your fork. Set the env vars from .env.local.example. Vercel's hobby plan is enough.",
  },
  {
    n: 4,
    title: "Connect Up Bank",
    body:
      "In settings, paste your Up PAT (generate one at api.up.com.au). Optionally enable the webhook for real-time syncing.",
  },
];

export default function SelfHostPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <section className="relative pt-16 md:pt-24 pb-12 px-4 overflow-hidden">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-accent-teal-light border border-accent-teal/30 px-4 py-1.5 rounded-full mb-6">
            <Github className="w-3.5 h-3.5 text-accent-teal" />
            <span className="font-[family-name:var(--font-dm-sans)] font-medium text-xs text-text-medium">
              Open source · MIT · Free forever
            </span>
          </div>

          <h1 className="font-[family-name:var(--font-nunito)] text-4xl md:text-5xl font-black text-text-primary leading-tight mb-5">
            Self-host PiggyBack
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-base md:text-lg text-text-label leading-relaxed mb-8 max-w-2xl mx-auto">
            Same app, same features, zero subscription. Run it on your own
            Supabase + Vercel. The whole stack, including this landing page,
            ships in the repo.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-[family-name:var(--font-nunito)] font-bold text-base bg-text-primary hover:bg-text-medium text-white px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-xl flex items-center justify-center gap-2"
            >
              <Github className="w-5 h-5" />
              View on GitHub
            </a>
            <Link
              href="/docs"
              className="font-[family-name:var(--font-nunito)] font-bold text-base bg-surface-white-60 hover:bg-white border-2 border-border-medium text-text-medium px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105 hover:shadow-lg flex items-center justify-center gap-2"
            >
              <BookOpen className="w-5 h-5" />
              Deploy guide
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== STEPS ===================== */}
      <section className="py-12 md:py-16 px-4 bg-white/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
              Four steps. About 15 minutes.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="rounded-2xl bg-surface-white-60 border border-border-light p-6"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 rounded-full bg-brand-coral text-white font-[family-name:var(--font-nunito)] font-black text-sm flex items-center justify-center">
                    {step.n}
                  </span>
                  <h3 className="font-[family-name:var(--font-nunito)] font-bold text-lg text-text-primary">
                    {step.title}
                  </h3>
                </div>
                <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary leading-relaxed pl-11">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== WHY THIS EXISTS ===================== */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-accent-teal uppercase tracking-wider mb-2">
                Why self-host?
              </p>
              <h2 className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black text-text-primary mb-4">
                Because Up Bank&apos;s API doesn&apos;t allow us to hold your
                credentials
              </h2>
              <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-6 leading-relaxed">
                Australian banking regulations and Up Bank&apos;s API terms
                don&apos;t permit a third party to store and serve your banking
                data back to you. PiggyBack is architecturally a SaaS that
                can&apos;t be a SaaS. So we made the architecture a feature: you
                run the app yourself, and we offer to manage the boring bits for
                you (A$19/month) if you&apos;d rather not click around Vercel
                and Supabase yourself.
              </p>
              <ul className="space-y-3">
                {[
                  { icon: Lock, text: "Your bank credentials live in your encrypted Supabase row" },
                  { icon: Database, text: "Your transactions live in your Supabase database" },
                  { icon: Server, text: "Runs on your Vercel account (free tier works for years)" },
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
                    You own the whole stack
                  </h3>
                  <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-sm mb-5">
                    Same code, same features, zero lock-in.
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

      {/* ===================== FOOTER CTA ===================== */}
      <section className="py-12 md:py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-5">
            Don&apos;t want to manage Vercel and Supabase yourself?
          </p>
          <Link
            href="/get-started"
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark text-white px-7 py-3.5 rounded-2xl transition-all duration-200 hover:scale-105"
          >
            Try the managed tier — A$19/month
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
