# Deploy PiggyBack to the Cloud

> Deploy PiggyBack using Vercel (free) and Supabase (free tier). This is the quickest way to get up and running.

## What You'll Need

- An [Up Bank](https://up.com.au/) account with an API token
- A [GitHub](https://github.com) account
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account

## Step 1: Set Up Supabase

### Create a New Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Choose your organization, name it (e.g. "piggyback"), set a database password, and choose a region close to you
4. Wait for the project to initialize (~2 minutes)

### Run the Database Migration

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Copy the **entire** contents of [`supabase/migrations/00000000000000_initial_schema.sql`](supabase/migrations/00000000000000_initial_schema.sql) from this repo
4. Paste it into the SQL Editor and click **"Run"**
5. This creates all 35+ tables, functions, triggers, and Row Level Security policies in one go

> **Already familiar with Supabase CLI?** You can also run `supabase db push` against your remote project instead of using the SQL Editor.

### Configure Authentication

1. Go to **Authentication** > **URL Configuration**
2. Set **Site URL** to your Vercel URL (you'll get this in Step 2 — you can come back to update it)
3. Under **Redirect URLs**, add:
   - `https://your-app.vercel.app/auth/callback`
   - `https://your-app.vercel.app/update-password`

> **Why this matters:** Supabase sends users to these URLs after email confirmation and password resets. If they're not configured, authentication will break. The app has a safety net that catches misrouted auth codes, but correct configuration here prevents the issue entirely.

### Get Your API Keys

1. Go to **Settings** > **API**
2. Copy these three values — you'll need them in Step 2:
   - **Project URL** (starts with `https://...supabase.co`)
   - **anon/public** key
   - **service_role** key (click "Reveal" — keep this secret!)

## Step 2: Deploy to Vercel

### One-Click Deploy

The fastest option — click the button and Vercel will fork the repo and set up the project for you:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/BenLaurenson/PiggyBack)

### Manual Deploy

If you prefer to fork the repo yourself:

1. Fork [this repository](https://github.com/BenLaurenson/PiggyBack) on GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your forked repository
4. Vercel will auto-detect Next.js — no build settings need to change

### Set Environment Variables

In your Vercel project, go to **Settings** > **Environment Variables** and add:

| Variable | Value | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Yes |
| `UP_API_ENCRYPTION_KEY` | A 32-character string (see below) | Yes |
| `NEXT_PUBLIC_APP_URL` | Your Vercel deployment URL | Yes |
| `CRON_SECRET` | A random secret string (see below) | Recommended |
| `NEXT_PUBLIC_SKIP_LANDING` | `true` | Optional |

**Generate your encryption key** (exactly 32 characters):

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

**Generate your cron secret:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Already familiar with Vercel?** You can also set environment variables via the Vercel CLI: `vercel env add VARIABLE_NAME`.

### Update Supabase Auth URLs

Now that you have your Vercel URL (e.g. `https://piggyback-abc123.vercel.app`):

1. Go back to Supabase **Authentication** > **URL Configuration**
2. Set **Site URL** to your Vercel URL
3. Update the **Redirect URLs** with your actual Vercel URL:
   - `https://piggyback-abc123.vercel.app/auth/callback`
   - `https://piggyback-abc123.vercel.app/update-password`

### Redeploy

After setting environment variables, trigger a redeployment from the Vercel dashboard:

1. Go to **Deployments**
2. Click **"..."** on the latest deployment
3. Click **"Redeploy"**

This ensures the build picks up your new environment variables.

## Step 3: First-Time Setup

1. Visit your deployed app
2. Click **Sign Up** and create your account
3. Check your email for the confirmation link and click it (check spam if you don't see it)
4. Complete the onboarding flow
5. Connect your Up Bank API token in **Settings** > **Up Bank Connection**

You can get your Up Bank API token from [api.up.com.au](https://api.up.com.au).

## Optional Configuration

### Change Region

The default Vercel region is `syd1` (Sydney, Australia). If you're not in Australia, change it to a region closer to you by editing `vercel.json`:

```json
{
  "regions": ["iad1"]
}
```

See [Vercel's region list](https://vercel.com/docs/edge-network/regions) for all available options. Common choices:

| Region | Code |
|--------|------|
| Sydney, Australia | `syd1` |
| US East (Virginia) | `iad1` |
| US West (Oregon) | `pdx1` |
| London, UK | `lhr1` |
| Frankfurt, Germany | `fra1` |
| Tokyo, Japan | `hnd1` |

### Enable Cron Jobs

PiggyBack has a daily cron job that sends payment reminders and (if AI is configured) weekly spending summaries.

1. Set the `CRON_SECRET` environment variable in Vercel (if you haven't already)
2. The cron is already configured in `vercel.json` to run daily at 9am UTC
3. To change the schedule, edit the `schedule` field in `vercel.json` (uses standard cron syntax)

> **Already familiar with cron?** The current schedule is `0 9 * * *`. Vercel cron jobs only work on deployed projects (not in development).

### AI Assistant

PiggyBack includes an optional AI financial assistant. No server-side API keys are needed — each user configures their own:

1. Go to **Settings** > **AI** in the app
2. Choose a provider:
   - **Google Gemini** — free tier available
   - **OpenAI** — requires paid API access
   - **Anthropic** — requires paid API access
3. Enter your API key
4. The AI can analyze your spending, answer budget questions, and provide financial insights

API keys are encrypted and stored per-user. They never leave the server except to call the provider's API.

### Up Bank Webhook (Real-Time Sync)

PiggyBack can receive real-time transaction notifications from Up Bank via webhooks. This is configured automatically when you connect your Up Bank account in the app — no manual setup required.

The webhook endpoint is `/api/upbank/webhook` on your deployed URL.

### Custom Domain

1. In Vercel, go to **Settings** > **Domains**
2. Add your custom domain and follow the DNS instructions
3. Update these three places with your new domain:
   - Supabase **Site URL** (Authentication > URL Configuration)
   - Supabase **Redirect URLs** (both `/auth/callback` and `/update-password`)
   - `NEXT_PUBLIC_APP_URL` environment variable in Vercel
4. Redeploy after updating the environment variable

## Troubleshooting

### "Invalid login credentials" after signup

You need to confirm your email first. Check your inbox (and spam folder) for the confirmation link from Supabase.

### Auth redirect goes to the wrong URL

Make sure your Supabase **Site URL** and **Redirect URLs** match your actual deployment URL exactly. The app has a safety net that catches misrouted auth codes, but correct configuration prevents the issue entirely.

### Build fails on Vercel

- Ensure all **required** environment variables are set (see the table above)
- Check that `NEXT_PUBLIC_SUPABASE_URL` starts with `https://`
- Check that `UP_API_ENCRYPTION_KEY` is exactly 32 characters
- Check the Vercel build logs for specific error messages

### Webhook not syncing transactions

- Verify `NEXT_PUBLIC_APP_URL` is set to your deployment URL (including `https://`)
- The webhook URL must be publicly accessible via HTTPS
- Check **Settings** > **Up Bank Connection** in the app to verify the webhook is registered
- Try disconnecting and reconnecting your Up Bank account

### Cron job not running

- Verify `CRON_SECRET` is set in Vercel environment variables
- Check the Vercel **Functions** tab for cron execution logs
- The cron runs daily at 9am UTC — make sure you're accounting for timezone differences
- Cron jobs only run on production deployments (not preview deployments)

### Database migration fails

- Make sure you copy the **entire** migration file (it's ~1,400 lines)
- Run it in a single query — don't split it into multiple queries
- If you get extension errors, the `uuid-ossp` and `pgcrypto` extensions should be created automatically by the migration. If not, enable them manually in **Database** > **Extensions**
