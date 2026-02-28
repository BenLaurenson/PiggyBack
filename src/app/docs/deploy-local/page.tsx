import {
  ExternalLink,
  Terminal,
  Database,
  Key,
  Sparkles,
  CheckCircle2,
  Server,
  Monitor,
  RefreshCw,
  Globe,
  Clock,
  UserPlus,
  Settings,
  Webhook,
  Container,
} from "lucide-react";
import { StepNumber } from "../_components/step-number";
import { CodeBlock } from "../_components/code-block";
import { InfoBox } from "../_components/info-box";
import { OptionCard } from "../_components/option-card";

export const metadata = {
  title: "Local Hosting - PiggyBack Documentation",
  description:
    "Run PiggyBack on your own machine or VPS using Docker. Full data sovereignty.",
};

export default function DeployLocalPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>
      {/* Page heading */}
      <section>
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-extrabold text-text-primary mb-3 flex items-center gap-3">
          <Server className="w-8 h-8 text-brand-coral" />
          Local Hosting
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary text-lg leading-relaxed max-w-2xl">
          Run PiggyBack on your own machine or VPS using Docker. Full data
          sovereignty.
        </p>
      </section>

      {/* Intro */}
      <InfoBox>
        Run PiggyBack on your own machine or VPS using Docker. Choose between{" "}
        <strong>hosted Supabase</strong> (easier) or a{" "}
        <strong>fully local Supabase instance</strong> (maximum privacy).
      </InfoBox>

      <InfoBox variant="warning">
        <strong>Note on webhooks:</strong> Up Bank webhooks require a publicly
        accessible HTTPS URL. On a local machine, real-time transaction syncing
        won&apos;t work unless you use a tunnel service like{" "}
        <a
          href="https://ngrok.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-700 underline"
        >
          ngrok
        </a>{" "}
        or{" "}
        <a
          href="https://developers.cloudflare.com/cloudflare-tunnel/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-700 underline"
        >
          Cloudflare Tunnel
        </a>
        . Without webhooks, your transactions will still sync — just when you
        open the app rather than in real time. If you&apos;re deploying to a VPS
        with a public domain, webhooks work out of the box.
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
            { label: "Git", detail: "To clone the repository" },
            {
              label: "Docker Desktop",
              detail:
                "Or Docker Engine on Linux — required for Docker and local Supabase",
            },
            {
              label: "Node.js 20+",
              detail: "Only needed if running without Docker",
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

      {/* Choose Your Database */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-4">
          Choose Your Database
        </h2>
        <div className="rounded-xl border border-border-medium overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-elevated border-b border-border-light">
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-text-primary px-4 py-3"></th>
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-blue-600 px-4 py-3">
                  Option A: Hosted
                </th>
                <th className="text-left font-[family-name:var(--font-nunito)] font-bold text-emerald-600 px-4 py-3">
                  Option B: Local
                </th>
              </tr>
            </thead>
            <tbody className="font-[family-name:var(--font-dm-sans)]">
              {[
                {
                  label: "Setup",
                  a: "Easier — free project at supabase.com",
                  b: "More involved — runs via Docker",
                },
                {
                  label: "Data location",
                  a: "Supabase's cloud servers",
                  b: "Your machine (Docker volumes)",
                },
                {
                  label: "Privacy",
                  a: "Standard cloud hosting",
                  b: "Full data sovereignty",
                },
                {
                  label: "Maintenance",
                  a: "Managed by Supabase",
                  b: "You manage backups/updates",
                },
                {
                  label: "Cost",
                  a: "Free tier (generous)",
                  b: "Free (your machine's resources)",
                },
                {
                  label: "Dashboard",
                  a: "supabase.com",
                  b: "localhost:54323",
                },
              ].map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-border-light last:border-0"
                >
                  <td className="px-4 py-3 font-[family-name:var(--font-nunito)] font-bold text-text-primary">
                    {row.label}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{row.a}</td>
                  <td className="px-4 py-3 text-text-secondary">{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

        <div className="space-y-5 ml-11">
          <OptionCard option="A" color="blue">
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
                Click <strong>New Project</strong>, name it, set a database
                password, choose a region
              </li>
              <li>Wait for initialization (~2 minutes)</li>
            </ol>
            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
              Run the migration:
            </p>
            <ol className="space-y-2 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
              <li>
                Go to <strong>SQL Editor</strong> &rarr;{" "}
                <strong>New query</strong>
              </li>
              <li>
                Copy the entire contents of{" "}
                <code className="bg-white/50 px-1 rounded">
                  supabase/migrations/00000000000000_initial_schema.sql
                </code>
              </li>
              <li>
                Paste and click <strong>Run</strong>
              </li>
            </ol>
            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
              Configure auth URLs:
            </p>
            <ol className="space-y-2 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
              <li>
                Go to <strong>Authentication</strong> &rarr;{" "}
                <strong>URL Configuration</strong>
              </li>
              <li>
                Set <strong>Site URL</strong> to{" "}
                <code className="bg-white/50 px-1 rounded">
                  http://localhost:3000
                </code>
              </li>
              <li>
                Add redirect URLs:{" "}
                <code className="bg-white/50 px-1 rounded">
                  http://localhost:3000/auth/callback
                </code>{" "}
                and{" "}
                <code className="bg-white/50 px-1 rounded">
                  http://localhost:3000/update-password
                </code>
              </li>
            </ol>
            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
              Get your keys:
            </p>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              Go to <strong>Settings</strong> &rarr; <strong>API</strong>. Note
              your <strong>Project URL</strong>, <strong>anon key</strong>, and{" "}
              <strong>service_role key</strong>.
            </p>
          </OptionCard>

          <OptionCard option="B" color="green">
            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
              Install the Supabase CLI:
            </p>
            <CodeBlock title="terminal">{`# macOS
brew install supabase/tap/supabase

# npm (all platforms)
npm install -g supabase`}</CodeBlock>

            <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
              Start local Supabase:
            </p>
            <CodeBlock title="terminal">{`cd PiggyBack
supabase start`}</CodeBlock>

            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              This pulls Docker images on first run (~2-5 minutes). Once
              running, you&apos;ll see output with your <strong>API URL</strong>,{" "}
              <strong>anon key</strong>, and <strong>service_role key</strong>.
              Copy these for the next step.
            </p>

            <InfoBox>
              The migration in{" "}
              <code className="bg-white/50 px-1 rounded">
                supabase/migrations/
              </code>{" "}
              is applied automatically when you start. Your data persists across
              restarts. To stop:{" "}
              <code className="bg-white/50 px-1 rounded">supabase stop</code>.
              Access the local dashboard at{" "}
              <a
                href="http://localhost:54323"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline"
              >
                localhost:54323
              </a>
              .
            </InfoBox>
          </OptionCard>
        </div>
      </section>

      {/* STEP 2: Clone & Configure */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <StepNumber n={2} />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
            <Key className="w-5 h-5 text-text-tertiary" />
            Clone &amp; Configure
          </h2>
        </div>

        <div className="space-y-5 ml-11">
          <CodeBlock title="terminal">{`git clone https://github.com/BenLaurenson/PiggyBack.git
cd PiggyBack
cp .env.local.example .env.local`}</CodeBlock>

          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Edit <code className="bg-white/50 px-1 rounded">.env.local</code>{" "}
            with your values:
          </p>

          <OptionCard option="A" color="blue">
            <CodeBlock title=".env.local">{`NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_dashboard
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_dashboard
UP_API_ENCRYPTION_KEY=your_64_character_hex_key
NEXT_PUBLIC_APP_URL=http://localhost:3000`}</CodeBlock>
          </OptionCard>

          <OptionCard option="B" color="green">
            <CodeBlock title=".env.local">{`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_supabase_start
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_supabase_start
UP_API_ENCRYPTION_KEY=your_64_character_hex_key
NEXT_PUBLIC_APP_URL=http://localhost:3000`}</CodeBlock>
          </OptionCard>

          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary">
            Generate Your Encryption Key
          </h3>
          <CodeBlock title="terminal">{`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`}</CodeBlock>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            This produces a 64-character hex string (32 bytes for AES-256-GCM). Paste it as your{" "}
            <code className="bg-white/50 px-1 rounded">
              UP_API_ENCRYPTION_KEY
            </code>
            .
          </p>

          <InfoBox>
            <strong>Tip:</strong> For personal use, add{" "}
            <code className="bg-white/50 px-1 rounded">
              NEXT_PUBLIC_SKIP_LANDING=true
            </code>{" "}
            to skip the marketing landing page.
          </InfoBox>
        </div>
      </section>

      {/* STEP 3: Run PiggyBack */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <StepNumber n={3} />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
            <Terminal className="w-5 h-5 text-text-tertiary" />
            Run PiggyBack
          </h2>
        </div>

        <div className="space-y-5 ml-11">
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-3 flex items-center gap-2">
              <Container className="w-4 h-4 text-text-tertiary" />
              With Docker (Recommended)
            </h3>
            <CodeBlock title="terminal">{`# Build and run
docker compose -f docker-compose.prod.yml up --build

# Run in the background
docker compose -f docker-compose.prod.yml up --build -d

# Stop
docker compose -f docker-compose.prod.yml down`}</CodeBlock>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mt-3">
              First build takes a few minutes. Once you see{" "}
              <code className="bg-white/50 px-1 rounded">Ready in Xs</code>,
              open{" "}
              <a
                href="http://localhost:3000"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline"
              >
                localhost:3000
              </a>
              .
            </p>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-text-tertiary" />
              Without Docker
            </h3>
            <CodeBlock title="terminal">{`npm install
npm run build
npm start`}</CodeBlock>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mt-3">
              The app starts on{" "}
              <a
                href="http://localhost:3000"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline"
              >
                localhost:3000
              </a>
              . For development with hot-reload, use{" "}
              <code className="bg-white/50 px-1 rounded">npm run dev</code>{" "}
              (runs on port 3005).
            </p>
          </div>
        </div>
      </section>

      {/* STEP 4: First-Time Setup */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <StepNumber n={4} />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-text-tertiary" />
            First-Time Setup
          </h2>
        </div>

        <div className="space-y-4 ml-11">
          <ol className="space-y-3 font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary list-decimal list-inside">
            <li>
              Open{" "}
              <a
                href="http://localhost:3000"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline"
              >
                localhost:3000
              </a>
            </li>
            <li>
              Click <strong>Sign Up</strong> and create your account
            </li>
            <li>
              <strong>Option A (hosted):</strong> Check your email for the
              confirmation link
            </li>
            <li>
              <strong>Option B (local):</strong> Email confirmation is disabled
              — you&apos;re signed in immediately
            </li>
            <li>Complete the onboarding flow</li>
            <li>
              Connect your Up Bank API token in <strong>Settings</strong> &rarr;{" "}
              <strong>Up Bank Connection</strong>
            </li>
          </ol>
        </div>
      </section>

      {/* STEP 5: Updating */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <StepNumber n={5} />
          <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-text-tertiary" />
            Updating
          </h2>
        </div>

        <div className="space-y-4 ml-11">
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
            Pull the latest changes and rebuild:
          </p>
          <CodeBlock title="terminal">{`git pull

# Docker:
docker compose -f docker-compose.prod.yml up --build -d

# Without Docker:
npm install
npm run build
npm start`}</CodeBlock>

          <InfoBox variant="warning">
            <strong>If there are new database migrations</strong>, apply them:
            <br />
            <strong>Option A:</strong> Run the new SQL in the Supabase SQL Editor
            <br />
            <strong>Option B:</strong>{" "}
            <code className="bg-white/50 px-1 rounded">
              supabase db reset
            </code>{" "}
            (warning: resets all data) or apply the specific migration manually
          </InfoBox>
        </div>
      </section>

      {/* Optional Configuration */}
      <section>
        <h2 className="font-[family-name:var(--font-nunito)] text-xl font-bold text-text-primary mb-5 flex items-center gap-2">
          <Settings className="w-5 h-5 text-text-tertiary" />
          Optional Configuration
        </h2>

        <div className="space-y-6">
          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-tertiary" />
              Cron Jobs (Payment Reminders)
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-3">
              Set up a cron job or scheduled task to call the endpoint daily:
            </p>
            <CodeBlock title="crontab">{`# Runs at 9am daily — replace <secret> with your CRON_SECRET
0 9 * * * curl -H "Authorization: Bearer <secret>" http://localhost:3000/api/cron/notifications`}</CodeBlock>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-text-tertiary" />
              AI Assistant
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              Each user configures their own AI provider — no server-side keys
              needed. Go to <strong>Settings</strong> &rarr; <strong>AI</strong>{" "}
              and choose Google Gemini, OpenAI, or Anthropic.
            </p>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Webhook className="w-4 h-4 text-text-tertiary" />
              Up Bank Webhooks (Real-Time Sync)
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary">
              For local deployments, you&apos;ll need a tunnel service like{" "}
              <a
                href="https://ngrok.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline"
              >
                ngrok
              </a>{" "}
              or{" "}
              <a
                href="https://developers.cloudflare.com/cloudflare-tunnel/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline"
              >
                Cloudflare Tunnel
              </a>
              . Set{" "}
              <code className="bg-white/50 px-1 rounded">
                WEBHOOK_BASE_URL
              </code>{" "}
              in your{" "}
              <code className="bg-white/50 px-1 rounded">.env.local</code> to
              your tunnel URL. Without webhooks, transactions sync when you open
              the app.
            </p>
          </div>

          <div className="rounded-xl border border-border-light bg-surface-elevated p-5">
            <h3 className="font-[family-name:var(--font-nunito)] font-bold text-sm text-text-primary mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4 text-text-tertiary" />
              Exposing to the Internet (VPS)
            </h3>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-3">
              Set up a reverse proxy (Nginx or Caddy) in front of port 3000.
              Caddy handles SSL automatically:
            </p>
            <CodeBlock title="Caddyfile">{`piggyback.yourdomain.com {
    reverse_proxy localhost:3000
}`}</CodeBlock>
            <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mt-3">
              Update{" "}
              <code className="bg-white/50 px-1 rounded">
                NEXT_PUBLIC_APP_URL
              </code>{" "}
              to your public domain. For Option A, also update Supabase redirect
              URLs.
            </p>
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
              title: 'Docker build fails with "standalone" error',
              body: "Make sure you're on the latest version. Run git pull and rebuild.",
            },
            {
              title: "Can't connect to local Supabase",
              body: "Verify Supabase is running (supabase status), check Docker is running (docker ps), and ensure ports 54321-54323 aren't in use.",
            },
            {
              title: '"Invalid login credentials" after signup',
              body: "Option A: Check your email for the confirmation link. Option B: This shouldn't happen since email confirmation is disabled. Try supabase db reset to start fresh.",
            },
            {
              title: "Auth redirect loops",
              body: 'Option A: Verify Supabase dashboard Site URL is http://localhost:3000 and redirect URLs include /auth/callback and /update-password. Option B: The config.toml handles this automatically.',
            },
            {
              title: "Port conflicts",
              body: "Docker runs on 3000. If it's taken, edit docker-compose.prod.yml ports. Dev server runs on 3005. Local Supabase uses 54321-54323.",
            },
            {
              title: "Database migration issues",
              body: "Option A: Ensure you copied the ENTIRE migration SQL (~1400 lines). Option B: Migrations apply automatically on supabase start. To reapply: supabase db reset.",
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
