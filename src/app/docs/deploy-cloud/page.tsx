import Link from "next/link";
import {
  ExternalLink,
  Database,
  Rocket,
  Key,
  Shield,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  Globe,
  Clock,
  UserPlus,
  Settings,
  Webhook,
} from "lucide-react";
import { StepNumber } from "../_components/step-number";
import { CodeBlock } from "../_components/code-block";
import { InfoBox } from "../_components/info-box";

const GITHUB_URL = "https://github.com/BenLaurenson/PiggyBack";

export const metadata = {
  title: "Cloud Hosting - PiggyBack Documentation",
  description:
    "Deploy PiggyBack to the cloud using Vercel and Supabase. Free tier, zero maintenance.",
};

export default function DeployCloudPage() {
  return (
    <div className="space-y-14">
      {/* Page heading */}
      <section>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-extrabold text-text-primary mb-3 flex items-center gap-3">
          <Cloud className="w-8 h-8 text-brand-coral" />
          Cloud Hosting
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-lg leading-relaxed max-w-2xl">
          Deploy PiggyBack to the cloud using Vercel and Supabase. Free tier,
          zero maintenance.
        </p>
      </section>

      {/* Intro */}
      <InfoBox>
        Deploy PiggyBack using <strong>Vercel</strong> (free) and{" "}
        <strong>Supabase</strong> (free tier). This is the quickest way to get
        up and running.
      </InfoBox>

      {/* Prerequisites */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-accent-teal" />
          What You&apos;ll Need
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              label: "An Up Bank account",
              detail:
                "You'll need a personal access token from the Up API developer portal",
            },
            {
              label: "A GitHub account",
              detail: "To fork the repository and connect to Vercel",
            },
            {
              label: "A Supabase account (free)",
              detail: "Sign up at supabase.com — free tier is sufficient",
            },
            {
              label: "A Vercel account (free)",
              detail:
                "Sign up at vercel.com — Hobby plan works, connect with GitHub",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border-light bg-surface-elevated p-4"
            >
              <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-1">
                {item.label}
              </p>
              <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* STEP 1: Set Up Supabase */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <StepNumber n={1} />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
            <Database className="w-5 h-5 text-text-tertiary" />
            Set Up Supabase
          </h2>
        </div>

        <div className="space-y-4 ml-11">
          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
            Create a New Project
          </h3>
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>
              Go to{" "}
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline inline-flex items-center gap-0.5"
              >
                supabase.com <ExternalLink className="w-3 h-3" />
              </a>{" "}
              and sign in
            </li>
            <li>
              Click <strong>&quot;New Project&quot;</strong>
            </li>
            <li>
              Choose your organization, name it (e.g. &quot;piggyback&quot;),
              set a database password, and choose a region close to you
            </li>
            <li>Wait for the project to initialize (~2 minutes)</li>
          </ol>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Run the Database Migration
          </h3>
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>
              In your Supabase dashboard, go to <strong>SQL Editor</strong>
            </li>
            <li>
              Click <strong>&quot;New query&quot;</strong>
            </li>
            <li>
              Copy the <strong>entire</strong> contents of{" "}
              <code className="bg-white/50 px-1 rounded">
                supabase/migrations/00000000000000_initial_schema.sql
              </code>
            </li>
            <li>
              Paste it into the SQL Editor and click{" "}
              <strong>&quot;Run&quot;</strong>
            </li>
            <li>
              This creates all 35+ tables, functions, triggers, and Row Level
              Security policies in one go
            </li>
          </ol>

          <InfoBox>
            <strong>Already familiar with Supabase CLI?</strong> You can also
            run{" "}
            <code className="bg-white/50 px-1 rounded">supabase db push</code>{" "}
            against your remote project instead of using the SQL Editor.
          </InfoBox>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Configure Authentication
          </h3>
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>
              Go to <strong>Authentication</strong> &rarr;{" "}
              <strong>URL Configuration</strong>
            </li>
            <li>
              Set <strong>Site URL</strong> to your Vercel URL (you&apos;ll get
              this in Step 2 — you can come back to update it)
            </li>
            <li>
              Under <strong>Redirect URLs</strong>, add:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
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
            </li>
          </ol>

          <InfoBox variant="warning">
            <strong>Why this matters:</strong> Supabase sends users to these
            URLs after email confirmation and password resets. If they&apos;re
            not configured, authentication will break.
          </InfoBox>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Get Your API Keys
          </h3>
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>
              Go to <strong>Settings</strong> &rarr; <strong>API</strong>
            </li>
            <li>
              Copy these three values — you&apos;ll need them in Step 2:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>
                  <strong>Project URL</strong> (starts with{" "}
                  <code className="bg-white/50 px-1 rounded">
                    https://...supabase.co
                  </code>
                  )
                </li>
                <li>
                  <strong>anon/public</strong> key
                </li>
                <li>
                  <strong>service_role</strong> key (click &quot;Reveal&quot; —
                  keep this secret!)
                </li>
              </ul>
            </li>
          </ol>
        </div>
      </section>

      {/* STEP 2: Deploy to Vercel */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <StepNumber n={2} />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
            <Rocket className="w-5 h-5 text-text-tertiary" />
            Deploy to Vercel
          </h2>
        </div>

        <div className="space-y-4 ml-11">
          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
            One-Click Deploy
          </h3>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            The fastest option — click the button and Vercel will fork the repo
            and set up the project for you:
          </p>
          <a
            href="https://vercel.com/new/clone?repository-url=https://github.com/BenLaurenson/PiggyBack"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-sm bg-black hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105"
          >
            <Rocket className="w-4 h-4" />
            Deploy with Vercel
          </a>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Manual Deploy
          </h3>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            If you prefer to fork the repo yourself:
          </p>
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>
              Fork{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline inline-flex items-center gap-0.5"
              >
                this repository <ExternalLink className="w-3 h-3" />
              </a>{" "}
              on GitHub
            </li>
            <li>
              Go to{" "}
              <a
                href="https://vercel.com/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline inline-flex items-center gap-0.5"
              >
                vercel.com/new <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Import your forked repository</li>
            <li>
              Vercel will auto-detect Next.js — no build settings need to change
            </li>
          </ol>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Set Environment Variables
          </h3>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            In your Vercel project, go to <strong>Settings</strong> &rarr;{" "}
            <strong>Environment Variables</strong> and add:
          </p>

          <div className="rounded-xl border border-border-medium overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-elevated border-b border-border-light">
                  <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                    Variable
                  </th>
                  <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                    Required
                  </th>
                  <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="font-[family-name:var(--font-dm-sans)]">
                {[
                  {
                    var: "NEXT_PUBLIC_SUPABASE_URL",
                    required: "Yes",
                    desc: "Your Supabase project URL",
                  },
                  {
                    var: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                    required: "Yes",
                    desc: "Your Supabase anon key",
                  },
                  {
                    var: "SUPABASE_SERVICE_ROLE_KEY",
                    required: "Yes",
                    desc: "Your Supabase service role key",
                  },
                  {
                    var: "UP_API_ENCRYPTION_KEY",
                    required: "Yes",
                    desc: "A 32-character hex string (see below)",
                  },
                  {
                    var: "NEXT_PUBLIC_APP_URL",
                    required: "Yes",
                    desc: "Your Vercel deployment URL",
                  },
                  {
                    var: "CRON_SECRET",
                    required: "Recommended",
                    desc: "A random secret for cron auth",
                  },
                  {
                    var: "NEXT_PUBLIC_SKIP_LANDING",
                    required: "Optional",
                    desc: "Set to 'true' to skip marketing page",
                  },
                ].map((row) => (
                  <tr key={row.var} className="border-b border-border-light">
                    <td className="px-4 py-3 font-mono text-xs text-brand-coral">
                      {row.var}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.required}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Generate Your Keys
          </h3>
          <CodeBlock title="terminal">{`# Generate encryption key (exactly 32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Generate cron secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}</CodeBlock>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Update Supabase Auth URLs
          </h3>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Now that you have your Vercel URL (e.g.{" "}
            <code className="bg-white/50 px-1 rounded">
              https://piggyback-abc123.vercel.app
            </code>
            ):
          </p>
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>
              Go back to Supabase <strong>Authentication</strong> &rarr;{" "}
              <strong>URL Configuration</strong>
            </li>
            <li>
              Set <strong>Site URL</strong> to your Vercel URL
            </li>
            <li>
              Update the <strong>Redirect URLs</strong> with your actual Vercel
              URL:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li>
                  <code className="bg-white/50 px-1 rounded">
                    https://piggyback-abc123.vercel.app/auth/callback
                  </code>
                </li>
                <li>
                  <code className="bg-white/50 px-1 rounded">
                    https://piggyback-abc123.vercel.app/update-password
                  </code>
                </li>
              </ul>
            </li>
          </ol>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mt-6">
            Redeploy
          </h3>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            After setting environment variables, trigger a redeployment from the
            Vercel dashboard to pick up your new values.
          </p>
        </div>
      </section>

      {/* STEP 3: First-Time Setup */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <StepNumber n={3} />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-text-tertiary" />
            First-Time Setup
          </h2>
        </div>

        <div className="space-y-4 ml-11">
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>Visit your deployed app</li>
            <li>
              Click <strong>Sign Up</strong> and create your account
            </li>
            <li>
              Check your email for the confirmation link and click it (check
              spam if you don&apos;t see it)
            </li>
            <li>Complete the onboarding flow</li>
            <li>
              Connect your Up Bank API token in <strong>Settings</strong> &rarr;{" "}
              <strong>Up Bank Connection</strong>
            </li>
          </ol>

          <InfoBox>
            Get your Up Bank API token from{" "}
            <a
              href="https://api.up.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-coral hover:underline inline-flex items-center gap-0.5"
            >
              api.up.com.au <ExternalLink className="w-3 h-3" />
            </a>
          </InfoBox>
        </div>
      </section>

      {/* Optional Configuration */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-5 flex items-center gap-2">
          <Settings className="w-5 h-5 text-text-tertiary" />
          Optional Configuration
        </h2>

        <div className="space-y-6 ml-0">
          {/* Change Region */}
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4 text-text-tertiary" />
              Change Region
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-3">
              The default Vercel region is{" "}
              <code className="bg-white/50 px-1 rounded">syd1</code> (Sydney).
              Edit{" "}
              <code className="bg-white/50 px-1 rounded">vercel.json</code> to
              change it:
            </p>
            <div className="rounded-xl border border-border-medium overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-elevated border-b border-border-light">
                    <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-2">
                      Region
                    </th>
                    <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-2">
                      Code
                    </th>
                  </tr>
                </thead>
                <tbody className="font-[family-name:var(--font-dm-sans)]">
                  {[
                    { region: "Sydney, Australia", code: "syd1" },
                    { region: "US East (Virginia)", code: "iad1" },
                    { region: "US West (Oregon)", code: "pdx1" },
                    { region: "London, UK", code: "lhr1" },
                    { region: "Frankfurt, Germany", code: "fra1" },
                    { region: "Tokyo, Japan", code: "hnd1" },
                  ].map((r) => (
                    <tr
                      key={r.code}
                      className="border-b border-border-light last:border-0"
                    >
                      <td className="px-4 py-2 text-text-secondary">
                        {r.region}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-brand-coral">
                        {r.code}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cron Jobs */}
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-tertiary" />
              Enable Cron Jobs
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              PiggyBack has a daily cron job for payment reminders and
              AI-generated weekly summaries. Set the{" "}
              <code className="bg-white/50 px-1 rounded">CRON_SECRET</code>{" "}
              environment variable in Vercel. The cron is already configured in{" "}
              <code className="bg-white/50 px-1 rounded">vercel.json</code> to
              run daily at 9am UTC.
            </p>
          </div>

          {/* AI Assistant */}
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-text-tertiary" />
              AI Assistant
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-2">
              No server-side API keys needed — each user configures their own in{" "}
              <strong>Settings</strong> &rarr; <strong>AI</strong>:
            </p>
            <ul className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-disc list-inside space-y-1">
              <li>
                <strong>Google Gemini</strong> — free tier available
              </li>
              <li>
                <strong>OpenAI</strong> — requires paid API access
              </li>
              <li>
                <strong>Anthropic</strong> — requires paid API access
              </li>
            </ul>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mt-2">
              API keys are encrypted and stored per-user. They never leave the
              server except to call the provider&apos;s API.
            </p>
          </div>

          {/* Webhooks */}
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Webhook className="w-4 h-4 text-text-tertiary" />
              Up Bank Webhook (Real-Time Sync)
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              Configured automatically when you connect your Up Bank account in
              the app — no manual setup required. The webhook endpoint is{" "}
              <code className="bg-white/50 px-1 rounded">
                /api/upbank/webhook
              </code>{" "}
              on your deployed URL.
            </p>
          </div>

          {/* Custom Domain */}
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4 text-text-tertiary" />
              Custom Domain
            </h3>
            <ol className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside space-y-2">
              <li>
                In Vercel, go to <strong>Settings</strong> &rarr;{" "}
                <strong>Domains</strong>
              </li>
              <li>
                Add your custom domain and follow the DNS instructions
              </li>
              <li>
                Update Supabase <strong>Site URL</strong> and{" "}
                <strong>Redirect URLs</strong> with your new domain
              </li>
              <li>
                Update{" "}
                <code className="bg-white/50 px-1 rounded">
                  NEXT_PUBLIC_APP_URL
                </code>{" "}
                in Vercel and redeploy
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-5">
          Troubleshooting
        </h2>
        <div className="space-y-4">
          {[
            {
              title: '"Invalid login credentials" after signup',
              body: "You need to confirm your email first. Check your inbox (and spam folder) for the confirmation link from Supabase.",
            },
            {
              title: "Auth redirect goes to the wrong URL",
              body: "Make sure your Supabase Site URL and Redirect URLs match your actual deployment URL exactly. The app has a safety net that catches misrouted auth codes, but correct configuration prevents the issue entirely.",
            },
            {
              title: "Build fails on Vercel",
              body: "Ensure all required environment variables are set. Check that NEXT_PUBLIC_SUPABASE_URL starts with https:// and UP_API_ENCRYPTION_KEY is exactly 32 characters.",
            },
            {
              title: "Webhook not syncing transactions",
              body: "Verify NEXT_PUBLIC_APP_URL is set to your deployment URL (including https://). The webhook URL must be publicly accessible. Try disconnecting and reconnecting your Up Bank account.",
            },
            {
              title: "Cron job not running",
              body: "Verify CRON_SECRET is set. The cron runs daily at 9am UTC. Cron jobs only run on production deployments (not preview deployments).",
            },
            {
              title: "Database migration fails",
              body: "Make sure you copy the entire migration file (~1,400 lines). Run it in a single query. If you get extension errors, enable uuid-ossp and pgcrypto manually in Database > Extensions.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border-light bg-surface-elevated p-5"
            >
              <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2">
                {item.title}
              </h3>
              <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
