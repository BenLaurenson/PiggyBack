import Link from "next/link";
import Image from "next/image";
import { Nunito, DM_Sans } from "next/font/google";
import { Scale, AlertTriangle } from "lucide-react";
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
  title: "Terms - PiggyBack",
  description:
    "Terms of use for PiggyBack. Your finances on autopilot with Up Bank. MIT licensed.",
};

export default function TermsPage() {
  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <main className="max-w-3xl mx-auto px-4 py-16">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Scale className="w-8 h-8 text-brand-coral" />
            <h1 className="font-[family-name:var(--font-nunito)] text-4xl font-black text-text-primary">
              Terms of Use
            </h1>
          </div>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
            Last updated: February 2026
          </p>
        </div>

        <div className="space-y-10 font-[family-name:var(--font-dm-sans)] text-text-medium leading-relaxed">
          {/* Important Disclaimer */}
          <div className="bg-warning-light border border-warning-border rounded-2xl p-6">
            <h2 className="font-[family-name:var(--font-nunito)] text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning-dark" />
              Important Disclaimer
            </h2>
            <p>
              PiggyBack is <strong>not financial advice</strong>. It is a personal finance tracking
              tool built for educational and personal use. Always consult a qualified financial
              advisor for financial decisions. PiggyBack is{" "}
              <strong>not affiliated with, endorsed by, or connected to Up Bank</strong> (Bendigo
              and Adelaide Bank / Up Money Pty Ltd) in any way.
            </p>
          </div>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              MIT License
            </h2>
            <p className="mb-4">
              PiggyBack is released under the MIT License. This means you are free to:
            </p>
            <ul className="space-y-2 ml-4 list-disc list-inside">
              <li>Use the software for any purpose</li>
              <li>Modify the source code</li>
              <li>Distribute copies</li>
              <li>Sublicense the software</li>
            </ul>
            <div className="mt-4 bg-surface-white-60 rounded-xl p-4 border border-border-light font-mono text-xs text-text-tertiary leading-relaxed">
              <p>MIT License</p>
              <p className="mt-2">
                Copyright (c) 2025 Ben Laurenson
              </p>
              <p className="mt-2">
                Permission is hereby granted, free of charge, to any person obtaining a copy of
                this software and associated documentation files (the &ldquo;Software&rdquo;), to deal in
                the Software without restriction, including without limitation the rights to use,
                copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
                Software, and to permit persons to whom the Software is furnished to do so,
                subject to the following conditions:
              </p>
              <p className="mt-2">
                The above copyright notice and this permission notice shall be included in all
                copies or substantial portions of the Software.
              </p>
              <p className="mt-2">
                THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
                IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
                FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              Up Bank API Usage
            </h2>
            <p className="mb-3">
              PiggyBack uses the Up Bank API to sync your transaction data. By using PiggyBack
              with your Up Bank account, you agree to:
            </p>
            <ul className="space-y-2 ml-4 list-disc list-inside">
              <li>
                Comply with{" "}
                <a
                  href="https://developer.up.com.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-coral-hover hover:underline cursor-pointer"
                >
                  Up Bank&rsquo;s API Terms of Use
                </a>
              </li>
              <li>Use your personal access token responsibly</li>
              <li>Not share your Up Bank API token with others</li>
              <li>Acknowledge that PiggyBack is an independent project, not affiliated with Up Bank</li>
            </ul>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              Self-Hosted Responsibility
            </h2>
            <p>
              As a self-hosted application, you are responsible for:
            </p>
            <ul className="space-y-2 ml-4 list-disc list-inside mt-3">
              <li>Securing your Supabase database and Vercel deployment</li>
              <li>Managing environment variables and API keys</li>
              <li>Keeping your deployment updated</li>
              <li>Backing up your data</li>
              <li>Complying with applicable privacy laws for your jurisdiction</li>
            </ul>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              No Warranty
            </h2>
            <p>
              PiggyBack is provided &ldquo;as is&rdquo; without warranty of any kind. The maintainers are
              not liable for any financial loss, data loss, or other damages arising from the
              use of this software. Use at your own risk.
            </p>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-nunito)] text-2xl font-bold text-text-primary mb-4">
              Contributing
            </h2>
            <p>
              Contributions to PiggyBack are welcome under the MIT License. By submitting a
              pull request, you agree to license your contribution under the same MIT License.
              See the{" "}
              <a
                href="https://github.com/BenLaurenson/PiggyBack"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral-hover hover:underline cursor-pointer"
              >
                GitHub repository
              </a>{" "}
              for contribution guidelines.
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
