# Deployment Architecture

PiggyBack can run as one or two Vercel projects from the same GitHub repository. Both deploy from the `main` branch — pushes trigger builds on both projects automatically.

## Projects

You can optionally run two instances: one for personal use with real bank data, and one as a public demo.

| | Personal | Demo |
|---|---|---|
| **Vercel Project** | Your personal project | Your demo project |
| **Supabase** | Your personal Supabase project | A separate demo Supabase project |
| **Purpose** | Personal finance tracking with real Up Bank data | Public demo site, read-only |
| **Demo mode** | Off | `NEXT_PUBLIC_DEMO_MODE=true` |
| **Skip landing** | `NEXT_PUBLIC_SKIP_LANDING=true` | Off (shows marketing landing page) |
| **Webhook** | Active (Up Bank sends events here) | None |

## Environment Variables

### Personal Instance

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Personal Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Personal Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (production/preview only) |
| `UP_API_ENCRYPTION_KEY` | AES-256-GCM key for Up API token encryption |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL (used for webhook registration) |
| `NEXT_PUBLIC_SKIP_LANDING` | `true` — skips landing page, redirects authenticated users from `/` to `/home` |

### Demo Instance

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Demo Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Demo Supabase anon key |
| `NEXT_PUBLIC_DEMO_MODE` | `true` — enables read-only demo mode |
| `DEMO_USER_EMAIL` | Auto-login email for demo |
| `DEMO_USER_PASSWORD` | Auto-login password for demo |
| `UP_API_ENCRYPTION_KEY` | Placeholder (required by imports) |
| `NEXT_PUBLIC_APP_URL` | Your demo deployment URL |

## Up Bank Webhook

The Up Bank webhook is registered via the Up Bank API and sends events to your personal instance:

```
https://your-app.vercel.app/api/upbank/webhook
```

The webhook URL is derived from `NEXT_PUBLIC_APP_URL` at registration time (with fallbacks to `VERCEL_URL` and `WEBHOOK_BASE_URL` for preview/dev environments). See `src/app/actions/upbank.ts`. The URL and HMAC secret are stored in `up_api_configs` in Supabase.

### Re-registering the webhook

If your project URL changes:

1. Update `NEXT_PUBLIC_APP_URL` in the Vercel project settings
2. Go to Settings > Up Bank Connection in the app
3. Click "Register Webhook" — this calls the Up Bank API with the new URL
4. The old webhook is replaced

### Webhook flow

```
Up Bank API → POST /api/upbank/webhook → HMAC-SHA256 verification → process transaction
```

## Build Settings

Both projects use:

- **Framework:** Next.js
- **Install:** `npm install`
- **Build:** `npm run build`
- **Node:** 24.x
