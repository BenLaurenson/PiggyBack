import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { Check, Github, ChevronRight, Scale } from "lucide-react";
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

export const metadata = {
  title: "Pricing — PiggyBack",
  description:
    "Self-host free, or A$19/month managed. Both options keep your data in your own Supabase and your app on your own Vercel.",
};

export default function PricingPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <section className="pt-16 md:pt-24 pb-12 px-4">
        <div className="max-w-5xl mx-auto text-center mb-14">
          <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-brand-coral-hover uppercase tracking-wider mb-2">
            Two options. No upsells.
          </p>
          <h1 className="font-[family-name:var(--font-nunito)] text-4xl md:text-5xl font-black text-text-primary mb-4">
            Pricing
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-base md:text-lg text-text-label max-w-2xl mx-auto">
            You always own your data, your infrastructure, and your bank
            credentials. Whichever tier you pick, that doesn&apos;t change.
          </p>
        </div>

        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
          {/* Self-host */}
          <div className="relative rounded-3xl border-2 border-border-medium bg-surface-white-60 p-8 flex flex-col">
            <div className="mb-6">
              <h3 className="font-[family-name:var(--font-nunito)] font-black text-2xl text-text-primary mb-1">
                Self-host
              </h3>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                For developers who want to run it themselves.
              </p>
            </div>
            <div className="mb-6">
              <span className="font-[family-name:var(--font-nunito)] font-black text-5xl text-text-primary">
                Free
              </span>
              <span className="font-[family-name:var(--font-dm-sans)] text-text-tertiary ml-2">
                forever
              </span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {[
                "Full source. MIT licensed.",
                "Your Supabase, your Vercel, your bills.",
                "Same features as Hosted.",
                "Community support via GitHub Issues.",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 font-[family-name:var(--font-dm-sans)] text-sm text-text-medium"
                >
                  <Check className="w-4 h-4 mt-0.5 text-accent-teal flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href="/self-host"
              className="font-[family-name:var(--font-nunito)] font-bold text-base bg-white hover:bg-gray-50 border-2 border-border-medium text-text-medium px-6 py-3.5 rounded-2xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <Github className="w-4 h-4" />
              Read the deploy guide
            </Link>
          </div>

          {/* Hosted */}
          <div className="relative rounded-3xl border-2 border-brand-coral bg-white p-8 flex flex-col shadow-xl shadow-shadow-coral-strong">
            <span className="absolute -top-3 right-6 inline-flex items-center px-3 py-1 rounded-full bg-brand-coral text-white text-xs font-[family-name:var(--font-nunito)] font-bold uppercase tracking-wider">
              Recommended
            </span>
            <div className="mb-6">
              <h3 className="font-[family-name:var(--font-nunito)] font-black text-2xl text-text-primary mb-1">
                Hosted
              </h3>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Sign in, connect Up, you&apos;re done.
              </p>
            </div>
            <div className="mb-6">
              <span className="font-[family-name:var(--font-nunito)] font-black text-5xl text-text-primary">
                A$19
              </span>
              <span className="font-[family-name:var(--font-dm-sans)] text-text-tertiary ml-2">
                /month
              </span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {[
                "We provision Supabase + Vercel for you, in your name.",
                "Custom subdomain on *.piggyback.finance.",
                "Updates pushed automatically when we ship.",
                "Email support — under 24h response.",
                "Cancel anytime. Your app, data, and keys stay with you.",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 font-[family-name:var(--font-dm-sans)] text-sm text-text-medium"
                >
                  <Check className="w-4 h-4 mt-0.5 text-accent-teal flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href="/get-started"
              className="group font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark text-white px-6 py-3.5 rounded-2xl transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              Get started
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
          </div>
        </div>

        {/* What we don't do */}
        <div className="max-w-3xl mx-auto mt-16 bg-white/60 rounded-3xl border border-border-light p-8">
          <h3 className="font-[family-name:var(--font-nunito)] font-black text-xl text-text-primary mb-4">
            What hosting <em>doesn&apos;t</em> include
          </h3>
          <ul className="space-y-2 font-[family-name:var(--font-dm-sans)] text-sm text-text-medium">
            <li>
              <strong>Your Supabase + Vercel bills.</strong> They&apos;re billed
              to you directly by Supabase and Vercel. The free tiers cover most
              users for years; if you outgrow them you&apos;ll see a bill from
              them, not us.
            </li>
            <li>
              <strong>Storage of your bank credentials.</strong> Your Up Bank
              token is encrypted and stored only in your own Supabase. We
              don&apos;t hold a copy.
            </li>
            <li>
              <strong>Lock-in.</strong> Cancel and you keep the deployment.
              Self-hosters and hosted users run the exact same app.
            </li>
          </ul>
        </div>

        <div className="text-center mt-10">
          <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary">
            <Scale className="w-3.5 h-3.5" />
            MIT licensed · No paid ads · No analytics in your app
          </span>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
