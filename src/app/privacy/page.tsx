import Link from "next/link";
import Image from "next/image";
import { Nunito, DM_Sans } from "next/font/google";
import { Shield, Database, Eye, Lock, Server } from "lucide-react";
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
  title: "Privacy - PiggyBack",
  description:
    "Privacy notice for PiggyBack, a self-hosted finance app. Your data stays on your own infrastructure.",
};

export default function PrivacyPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <main className="max-w-3xl mx-auto px-4 py-16">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Image
              src="/images/mascot/buck-shield.png"
              alt="Buck in protective stance"
              width={48}
              height={48}
              className="object-contain"
            />
            <h1 className="font-[family-name:var(--font-nunito)] text-4xl font-black text-text-primary">
              Privacy Notice
            </h1>
          </div>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
            Last updated: February 2026
          </p>
        </div>

        <div className="space-y-10 font-[family-name:var(--font-dm-sans)] text-text-medium leading-relaxed">
          {/* Self-hosted notice */}
          <div className="bg-accent-teal-light/30 border border-accent-teal-border rounded-2xl p-6">
            <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
              <Server className="w-5 h-5 text-accent-teal" />
              PiggyBack is Self-Hosted
            </h2>
            <p>
              PiggyBack is an open source, self-hosted application. When you deploy PiggyBack,{" "}
              <strong>you are the data controller</strong>. All data is stored in your own
              Supabase project on infrastructure you control. The PiggyBack project maintainers
              have no access to your data, your database, or your deployed instance.
            </p>
          </div>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              What Data is Stored
            </h2>
            <p className="mb-4">
              When you deploy and use PiggyBack, the following data is stored in{" "}
              <strong>your own Supabase database</strong>:
            </p>
            <ul className="space-y-3 ml-4">
              <li className="flex items-start gap-3">
                <Database className="w-4 h-4 mt-1 text-text-tertiary flex-shrink-0" />
                <span>
                  <strong>Account data:</strong> Email, display name, and authentication credentials
                  (managed by Supabase Auth)
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Database className="w-4 h-4 mt-1 text-text-tertiary flex-shrink-0" />
                <span>
                  <strong>Up Bank API tokens:</strong> Your personal access tokens, encrypted and stored
                  with Supabase Row Level Security (RLS) enforced
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Database className="w-4 h-4 mt-1 text-text-tertiary flex-shrink-0" />
                <span>
                  <strong>Transaction data:</strong> Synced from Up Bank via their official API
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Database className="w-4 h-4 mt-1 text-text-tertiary flex-shrink-0" />
                <span>
                  <strong>Budget and goal data:</strong> Your budgets, savings goals, categories,
                  and financial plans
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Database className="w-4 h-4 mt-1 text-text-tertiary flex-shrink-0" />
                <span>
                  <strong>Partner linkage:</strong> If you connect with a partner, a relationship
                  record linking two accounts
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Up Bank Token Handling
            </h2>
            <p className="mb-3">
              Your Up Bank personal access token is required to sync transactions. Here&rsquo;s how
              it&rsquo;s handled:
            </p>
            <ul className="space-y-2 ml-4 list-disc list-inside">
              <li>Stored in your Supabase database with Row Level Security</li>
              <li>Only accessible by your authenticated session</li>
              <li>Used server-side only to make API calls to Up Bank</li>
              <li>Never sent to any third-party service</li>
              <li>You can revoke it at any time from your Up Bank app</li>
            </ul>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Analytics and Tracking
            </h2>
            <p>
              PiggyBack does not include any analytics, tracking, or telemetry by default. The
              application makes no external network requests other than to Up Bank&rsquo;s API
              (for transaction syncing) and any AI providers you configure. If you add analytics
              to your deployment, that is your responsibility as the deployer.
            </p>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              AI Features
            </h2>
            <p>
              If you enable the AI chat assistant, your financial data may be sent to the AI
              provider you configure (Anthropic, OpenAI, or Google) as part of the chat context.
              This is controlled by your environment variables and your choice of AI provider.
              Review your chosen provider&rsquo;s privacy policy for how they handle API inputs.
            </p>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              Data Deletion
            </h2>
            <p>
              Since you control the database, you can delete any or all data at any time through
              Supabase&rsquo;s dashboard or SQL editor. Deleting your Supabase project will remove
              all PiggyBack data permanently.
            </p>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              Open Source
            </h2>
            <p>
              PiggyBack is MIT licensed and open source. You can audit the entire codebase on{" "}
              <a
                href="https://github.com/BenLaurenson/PiggyBack"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral-hover hover:underline cursor-pointer"
              >
                GitHub
              </a>{" "}
              to verify exactly how your data is handled.
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
