# Deploy PiggyBack Locally

> Run PiggyBack on your own machine or VPS using Docker. Choose between hosted Supabase (easier) or a fully local Supabase instance (maximum privacy).

## What You'll Need

- An [Up Bank](https://up.com.au/) account with an API token
- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux)
- [Node.js 20+](https://nodejs.org/) (only needed if running without Docker)

## Choose Your Database

| | Option A: Hosted Supabase | Option B: Local Supabase |
|---|---|---|
| **Setup** | Easier — create a free project at supabase.com | More involved — runs via Docker |
| **Data location** | Supabase's cloud servers | Your machine (Docker volumes) |
| **Privacy** | Standard cloud hosting | Full data sovereignty |
| **Maintenance** | Managed by Supabase | You manage backups/updates |
| **Cost** | Free tier (generous for personal use) | Free (uses your machine's resources) |
| **Dashboard** | Full Supabase dashboard at supabase.com | Local Studio at localhost:54323 |

Pick one and follow the matching instructions below. You can switch later.

---

## Step 1: Set Up Supabase

### Option A: Hosted Supabase

> **Already familiar with Supabase?** Create a project, run the migration from `supabase/migrations/00000000000000_initial_schema.sql`, configure auth redirect URLs, and grab your API keys. Skip to [Step 2](#step-2-clone--configure).

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Name it (e.g. "piggyback"), set a database password, choose a region
4. Wait for initialization (~2 minutes)

**Run the migration:**

1. Go to **SQL Editor** > **New query**
2. Copy the entire contents of `supabase/migrations/00000000000000_initial_schema.sql`
3. Paste and click **Run**

**Configure auth URLs:**

1. Go to **Authentication** > **URL Configuration**
2. Set **Site URL** to `http://localhost:3000`
3. Add **Redirect URLs**:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/update-password`

**Get your keys:**

1. Go to **Settings** > **API**
2. Note your **Project URL**, **anon key**, and **service_role key**

### Option B: Local Supabase

> **Already familiar with the Supabase CLI?** Run `supabase start` from the project root — `config.toml` and the migration are already in place. Grab the keys from the output and skip to [Step 2](#step-2-clone--configure).

**Install the Supabase CLI:**

```bash
# macOS
brew install supabase/tap/supabase

# npm (all platforms)
npm install -g supabase

# Or see: https://supabase.com/docs/guides/local-development/cli/getting-started
```

**Start local Supabase:**

```bash
cd PiggyBack
supabase start
```

This pulls Docker images on first run (~2-5 minutes). Once running, you'll see output like:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
        anon key: eyJhbG...
service_role key: eyJhbG...
```

**Copy the `anon key` and `service_role key`** — you'll need them in Step 2.

The migration in `supabase/migrations/` is applied automatically when you start.

**Your data persists** across restarts. To stop: `supabase stop`. To stop AND delete data: `supabase stop --no-backup`.

> **Local Studio:** Access the Supabase dashboard at [localhost:54323](http://localhost:54323) to browse your database, manage users, and run SQL.

---

## Step 2: Clone & Configure

> **Already cloned the repo?** Just copy `.env.local.example` to `.env.local`, fill in your values, and skip to [Step 3](#step-3-run-piggyback).

```bash
git clone https://github.com/BenLaurenson/PiggyBack.git
cd PiggyBack
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

### Option A: Hosted Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_dashboard
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_dashboard
UP_API_ENCRYPTION_KEY=your_32_character_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Option B: Local Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_supabase_start
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_supabase_start
UP_API_ENCRYPTION_KEY=your_32_character_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Generate your encryption key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This produces a 64-character hex string (32 bytes for AES-256-GCM). Paste it as your `UP_API_ENCRYPTION_KEY`.

> **Tip:** For personal use, add `NEXT_PUBLIC_SKIP_LANDING=true` to skip the marketing landing page.

---

## Step 3: Run PiggyBack

### With Docker (Recommended)

```bash
docker compose -f docker-compose.prod.yml up --build
```

First build takes a few minutes. Once you see `Ready in Xs`, open [localhost:3000](http://localhost:3000).

To run in the background:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

To stop:

```bash
docker compose -f docker-compose.prod.yml down
```

### Without Docker

```bash
npm install
npm run build
npm start
```

The app starts on [localhost:3000](http://localhost:3000).

For development with hot-reload:

```bash
npm run dev
```

This runs on [localhost:3005](http://localhost:3005) instead.

---

## Step 4: First-Time Setup

1. Open [localhost:3000](http://localhost:3000)
2. Click **Sign Up** and create your account
3. **Option A (hosted):** Check your email for the confirmation link
4. **Option B (local):** Email confirmation is disabled — you're signed in immediately
5. Complete the onboarding flow
6. Connect your Up Bank API token in **Settings** > **Up Bank Connection**

---

## Updating

Pull the latest changes and rebuild:

```bash
git pull

# Docker:
docker compose -f docker-compose.prod.yml up --build -d

# Without Docker:
npm install
npm run build
npm start
```

**If there are new database migrations**, apply them:

- **Option A:** Run the new SQL in the Supabase SQL Editor
- **Option B:** `supabase db reset` (warning: this resets all data) or apply the specific migration manually

---

## Optional Configuration

### Cron Jobs (Payment Reminders)

PiggyBack has a daily notification system for payment reminders and AI-generated weekly summaries. In a local deployment, you'll need to set up your own scheduler.

1. Add `CRON_SECRET=your_random_secret` to `.env.local`
2. Set up a cron job or scheduled task to call the endpoint daily:

```bash
# Example crontab entry (runs at 9am daily)
# Replace <secret> with the CRON_SECRET value from your .env.local
0 9 * * * curl -H "Authorization: Bearer <secret>" http://localhost:3000/api/cron/notifications
```

### AI Assistant

Each user configures their own AI provider — no server-side keys needed:

1. Go to **Settings** > **AI** in the app
2. Choose Google Gemini, OpenAI, or Anthropic
3. Enter your API key

### Up Bank Webhooks (Real-Time Sync)

For real-time transaction syncing, the webhook endpoint needs to be reachable from the internet. For local deployments:

1. Use a tunnel service like [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-tunnel/)
2. Set `WEBHOOK_BASE_URL` in `.env.local` to your tunnel URL
3. Register the webhook in **Settings** > **Up Bank Connection**

Without webhooks, transactions sync when you open the app.

### Exposing to the Internet (VPS)

If running on a VPS and you want public access:

1. Set up a reverse proxy (Nginx or Caddy) in front of port 3000
2. Configure SSL/TLS (Caddy does this automatically with Let's Encrypt)
3. Update `NEXT_PUBLIC_APP_URL` to your public domain
4. **Option A:** Update Supabase redirect URLs to use your public domain

Example Caddy config:

```
piggyback.yourdomain.com {
    reverse_proxy localhost:3000
}
```

---

## Troubleshooting

### Docker build fails with "standalone" error

Make sure you're on the latest version. Run `git pull` and rebuild.

### Can't connect to local Supabase

- Verify Supabase is running: `supabase status`
- Check Docker is running: `docker ps`
- Ensure ports 54321-54323 aren't in use by another service

### "Invalid login credentials" after signup

- **Option A:** Check your email for the confirmation link
- **Option B:** This shouldn't happen since email confirmation is disabled. Try `supabase db reset` to start fresh.

### Auth redirect loops

- **Option A:** Verify Supabase dashboard Site URL is `http://localhost:3000` and redirect URLs include `/auth/callback` and `/update-password`
- **Option B:** The config.toml handles this automatically

### Port conflicts

- Docker runs on 3000. If it's taken: edit `docker-compose.prod.yml` ports to `"3001:3000"`
- Dev server runs on 3005. If it's taken: edit the `dev` script in `package.json`
- Local Supabase uses 54321-54323. If conflicting: edit `supabase/config.toml`

### Database migration issues

- **Option A:** Ensure you copied the ENTIRE migration SQL (it's ~1400 lines)
- **Option B:** Migrations apply automatically on `supabase start`. If you need to reapply: `supabase db reset`
