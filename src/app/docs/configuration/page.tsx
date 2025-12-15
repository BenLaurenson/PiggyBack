import {
  Settings,
  Key,
  Shield,
  Clock,
  Sparkles,
  Webhook,
  Globe,
} from "lucide-react";
import { CodeBlock } from "../_components/code-block";
import { InfoBox } from "../_components/info-box";

export const metadata = {
  title: "Configuration - PiggyBack Documentation",
  description:
    "Environment variables, cron jobs, AI assistant, webhooks, and custom domain configuration for PiggyBack.",
};

export default function ConfigurationPage() {
  return (
    <div className="space-y-14">
      {/* Page heading */}
      <section>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-extrabold text-text-primary mb-3 flex items-center gap-3">
          <Settings className="w-8 h-8 text-brand-coral" />
          Configuration
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-lg leading-relaxed max-w-2xl">
          Reference for all environment variables and optional configuration
          options.
        </p>
      </section>

      {/* Section 1: Environment Variables */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-text-tertiary" />
          Environment Variables
        </h2>

        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-4">
          All environment variables used by PiggyBack. Set these in your{" "}
          <code className="bg-white/50 px-1 rounded">.env.local</code> file or
          in your hosting provider&apos;s dashboard.
        </p>

        <div className="rounded-xl border border-border-light bg-surface-elevated overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-elevated border-b border-border-light">
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                  Variable
                </th>
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                  Description
                </th>
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                  Required
                </th>
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                  Default
                </th>
              </tr>
            </thead>
            <tbody className="font-[family-name:var(--font-dm-sans)]">
              {[
                {
                  var: "NEXT_PUBLIC_SUPABASE_URL",
                  desc: "Your Supabase project URL",
                  required: "Yes",
                  default: "\u2014",
                },
                {
                  var: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                  desc: "Supabase anon/public key",
                  required: "Yes",
                  default: "\u2014",
                },
                {
                  var: "SUPABASE_SERVICE_ROLE_KEY",
                  desc: "Supabase service role key (server-side only)",
                  required: "Yes",
                  default: "\u2014",
                },
                {
                  var: "UP_API_ENCRYPTION_KEY",
                  desc: "32-character AES encryption key for storing Up Bank tokens",
                  required: "Yes",
                  default: "\u2014",
                },
                {
                  var: "NEXT_PUBLIC_APP_URL",
                  desc: "Your deployment URL (used for auth redirects and webhooks)",
                  required: "Recommended",
                  default: "Falls back to VERCEL_URL on Vercel",
                },
                {
                  var: "CRON_SECRET",
                  desc: "Secret token for the daily notification cron job",
                  required: "Optional",
                  default: "\u2014",
                },
                {
                  var: "NEXT_PUBLIC_SKIP_LANDING",
                  desc: "Skip marketing landing page (useful for personal deployments)",
                  required: "Optional",
                  default: "false",
                },
              ].map((row, i) => (
                <tr
                  key={row.var}
                  className={`border-b border-border-light last:border-0 ${
                    i % 2 === 1 ? "bg-surface-secondary/30" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-brand-coral whitespace-nowrap">
                    {row.var}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{row.desc}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {row.required}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary text-xs">
                    {row.default}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5">
          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-3">
            Generate Your Keys
          </h3>
          <CodeBlock title="terminal">{`# Generate a 32-character encryption key
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Generate a cron secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}</CodeBlock>
        </div>
      </section>

      {/* Section 2: Supabase Auth URLs */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-text-tertiary" />
          Supabase Auth URLs
        </h2>

        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-4">
          You <strong>must</strong> configure these in your Supabase dashboard
          under <strong>Authentication</strong> &rarr;{" "}
          <strong>URL Configuration</strong>:
        </p>

        <div className="space-y-4">
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              Site URL
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              Your deployment URL (e.g.{" "}
              <code className="bg-white/50 px-1 rounded">
                https://your-app.vercel.app
              </code>{" "}
              or{" "}
              <code className="bg-white/50 px-1 rounded">
                http://localhost:3000
              </code>
              )
            </p>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              Redirect URLs
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-2">
              Add both of the following:
            </p>
            <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-disc list-inside space-y-1">
              <li>
                <code className="bg-white/50 px-1 rounded">
                  https://your-app.vercel.app/auth/callback
                </code>
              </li>
              <li>
                <code className="bg-white/50 px-1 rounded">
                  https://your-app.vercel.app/update-password
                </code>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <InfoBox variant="warning">
            <strong>Auth will not work without these.</strong> Supabase sends
            users to these URLs after email confirmation and password resets. If
            they&apos;re not configured, login and signup will fail silently.
          </InfoBox>
        </div>
      </section>

      {/* Section 3: Cron Jobs */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-text-tertiary" />
          Cron Jobs
        </h2>

        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-5">
          PiggyBack has a daily cron job for payment reminders and AI-generated
          weekly summaries.
        </p>

        <div className="space-y-4">
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              On Vercel (automatic)
            </h3>
            <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-disc list-inside space-y-1">
              <li>
                Already configured in{" "}
                <code className="bg-white/50 px-1 rounded">vercel.json</code>{" "}
                &mdash; runs daily at 9am UTC
              </li>
              <li>
                Requires the{" "}
                <code className="bg-white/50 px-1 rounded">CRON_SECRET</code>{" "}
                environment variable
              </li>
              <li>Only runs on production deployments</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              Self-hosted (manual)
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-3">
              Set{" "}
              <code className="bg-white/50 px-1 rounded">CRON_SECRET</code> in
              your{" "}
              <code className="bg-white/50 px-1 rounded">.env.local</code> file,
              then set up a cron job:
            </p>
            <CodeBlock title="crontab">{`0 9 * * * curl -H "Authorization: Bearer <your-cron-secret>" http://localhost:3000/api/cron/notifications`}</CodeBlock>
          </div>
        </div>
      </section>

      {/* Section 4: AI Assistant */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-text-tertiary" />
          AI Assistant
        </h2>

        <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-3">
            No server-side API keys needed. Each user configures their own
            provider in <strong>Settings</strong> &rarr; <strong>AI</strong>.
          </p>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
            Supported Providers
          </h3>
          <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-disc list-inside space-y-1">
            <li>
              <strong>Google Gemini</strong> &mdash; free tier available
            </li>
            <li>
              <strong>OpenAI</strong> &mdash; requires paid API access
            </li>
            <li>
              <strong>Anthropic</strong> &mdash; requires paid API access
            </li>
          </ul>

          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mt-3">
            API keys are encrypted and stored per-user. They never leave the
            server except to call the provider&apos;s API.
          </p>
        </div>
      </section>

      {/* Section 5: Up Bank Webhooks */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Webhook className="w-5 h-5 text-text-tertiary" />
          Up Bank Webhooks
        </h2>

        <div className="space-y-4">
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              Cloud Deployments
            </h3>
            <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-disc list-inside space-y-1">
              <li>
                Webhooks are registered automatically when you connect Up Bank
                in Settings
              </li>
              <li>
                Endpoint:{" "}
                <code className="bg-white/50 px-1 rounded">
                  /api/upbank/webhook
                </code>{" "}
                on your deployment URL
              </li>
              <li>
                Requires{" "}
                <code className="bg-white/50 px-1 rounded">
                  NEXT_PUBLIC_APP_URL
                </code>{" "}
                to be set correctly
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              Local Deployments
            </h3>
            <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-disc list-inside space-y-1">
              <li>
                Need a tunnel service (ngrok or Cloudflare Tunnel) to expose
                your local server
              </li>
              <li>
                Set{" "}
                <code className="bg-white/50 px-1 rounded">
                  WEBHOOK_BASE_URL
                </code>{" "}
                in{" "}
                <code className="bg-white/50 px-1 rounded">.env.local</code> to
                your tunnel URL
              </li>
              <li>
                Without webhooks, transactions sync when you open the app
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 6: Custom Domain */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-text-tertiary" />
          Custom Domain
        </h2>

        <div className="space-y-4">
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              Vercel
            </h3>
            <ol className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside space-y-2">
              <li>
                In Vercel, go to <strong>Settings</strong> &rarr;{" "}
                <strong>Domains</strong> and add your domain
              </li>
              <li>
                Update{" "}
                <code className="bg-white/50 px-1 rounded">
                  NEXT_PUBLIC_APP_URL
                </code>{" "}
                to your new domain
              </li>
              <li>
                Update Supabase <strong>Site URL</strong> and{" "}
                <strong>Redirect URLs</strong> with your new domain
              </li>
              <li>Redeploy</li>
            </ol>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
              Self-hosted (VPS with Caddy)
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-3">
              Example Caddy configuration for reverse-proxying to your PiggyBack
              instance:
            </p>
            <CodeBlock title="Caddyfile">{`piggyback.yourdomain.com {
    reverse_proxy localhost:3000
}`}</CodeBlock>
          </div>
        </div>
      </section>
    </div>
  );
}
