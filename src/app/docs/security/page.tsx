import {
  ShieldCheck,
  Lock,
  Shield,
  CheckCircle2,
  Key,
  Users,
  AlertTriangle,
  Mail,
  Clock,
  Scale,
} from "lucide-react";
import { InfoBox } from "../_components/info-box";

export const metadata = {
  title: "Security - PiggyBack Documentation",
  description:
    "Security measures, vulnerability reporting, and responsible disclosure for PiggyBack.",
};

export default function SecurityPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>
      {/* Page heading */}
      <section>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-extrabold text-text-primary mb-3 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-brand-coral" />
          Security Policy
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-lg leading-relaxed max-w-2xl">
          How PiggyBack protects your data, and how to report vulnerabilities
          responsibly.
        </p>
      </section>

      {/* Supported Versions */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-text-tertiary" />
          Supported Versions
        </h2>

        <div className="rounded-xl border border-border-medium overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-elevated border-b border-border-light">
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                  Version
                </th>
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                  Supported
                </th>
              </tr>
            </thead>
            <tbody className="font-[family-name:var(--font-dm-sans)]">
              <tr className="border-b border-border-light">
                <td className="px-4 py-3 font-mono text-xs text-text-primary">
                  0.9.x
                </td>
                <td className="px-4 py-3 text-emerald-600 font-semibold">
                  Yes
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-text-primary">
                  &lt; 0.9
                </td>
                <td className="px-4 py-3 text-text-tertiary">No</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Reporting a Vulnerability */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-text-tertiary" />
          Reporting a Vulnerability
        </h2>

        <div className="space-y-5">
          <InfoBox variant="warning">
            <strong>
              Please do not open a public GitHub issue for security
              vulnerabilities.
            </strong>
          </InfoBox>

          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Instead, report vulnerabilities via one of these methods:
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
              <div className="w-9 h-9 rounded-lg bg-brand-coral/10 flex items-center justify-center text-brand-coral mb-3">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
                GitHub Private Vulnerability Reporting
              </h3>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Use the{" "}
                <a
                  href="https://github.com/BenLaurenson/PiggyBack/security/advisories"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-coral hover:underline"
                >
                  Security Advisories
                </a>{" "}
                tab to privately report the issue.
              </p>
            </div>

            <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
              <div className="w-9 h-9 rounded-lg bg-brand-coral/10 flex items-center justify-center text-brand-coral mb-3">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
                Email
              </h3>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                Contact the maintainer directly (see GitHub profile).
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-3">
              What to Include
            </h3>
            <ul className="space-y-2 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              <li className="flex gap-2">
                <span className="text-brand-coral font-bold">&bull;</span>
                <span>Description of the vulnerability</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-coral font-bold">&bull;</span>
                <span>Steps to reproduce</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-coral font-bold">&bull;</span>
                <span>Potential impact</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-coral font-bold">&bull;</span>
                <span>Suggested fix (if any)</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-tertiary" />
              Response Timeline
            </h3>
            <div className="space-y-3">
              {[
                {
                  time: "48 hours",
                  desc: "Acknowledgement of your report",
                },
                {
                  time: "1 week",
                  desc: "Initial assessment and severity rating",
                },
                {
                  time: "30 days",
                  desc: "Target for a fix, depending on complexity",
                },
              ].map((item) => (
                <div key={item.time} className="flex items-start gap-3">
                  <span className="font-[family-name:var(--font-nunito)] font-bold text-sm text-brand-coral whitespace-nowrap min-w-[80px]">
                    {item.time}
                  </span>
                  <span className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary mt-3">
              You will be credited in the release notes (unless you prefer
              otherwise).
            </p>
          </div>
        </div>
      </section>

      {/* Security Measures */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-5 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-text-tertiary" />
          Security Measures
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              icon: Lock,
              title: "AES-256-GCM Encryption",
              desc: "Up Bank API tokens are encrypted at rest in the database using AES-256-GCM.",
            },
            {
              icon: Shield,
              title: "Row Level Security",
              desc: "All user-facing Supabase tables are protected with RLS policies, ensuring users can only access their own data.",
            },
            {
              icon: CheckCircle2,
              title: "HMAC-SHA256 Verification",
              desc: "Up Bank webhook payloads are verified with timing-safe comparison to prevent tampering.",
            },
            {
              icon: Key,
              title: "Server-Side Secrets",
              desc: "Encryption keys and API credentials are never exposed to client-side code.",
            },
            {
              icon: Users,
              title: "Supabase Auth SSR",
              desc: "Cookie-based sessions with secure defaults, managed via Supabase Auth with SSR.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-surface-elevated border border-border-light rounded-xl p-5"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-coral/10 flex items-center justify-center text-brand-coral mb-3">
                <item.icon className="w-5 h-5" />
              </div>
              <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-1">
                {item.title}
              </h3>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Responsible Disclosure */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Scale className="w-5 h-5 text-text-tertiary" />
          Responsible Disclosure
        </h2>

        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-4">
          We follow responsible disclosure practices. We ask that you:
        </p>

        <ul className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Allow reasonable time for us to address the issue before public
              disclosure
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Avoid accessing or modifying other users&apos; data
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-coral font-bold">&bull;</span>
            <span>
              Act in good faith to avoid degradation of the service
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
