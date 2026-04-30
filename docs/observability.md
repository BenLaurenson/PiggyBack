# Observability

Phase 4 instrumentation for PiggyBack: activation rate, time-to-first-sync,
per-step provisioning funnel, retention, and cancellation reason capture.

## Hosting choice: PostHog Cloud (free tier)

We send the funnel events to **PostHog Cloud** by default. Reasons:

- Native funnel + retention analytics (no SQL plumbing needed)
- Generous free tier (1M events/month) — enough for our scale
- Self-hostable (Docker compose) for operators who don't want to use the
  Cloud product
- Simple HTTP capture API — no SDK in the bundle, just a server-side fetch
- Cookies + anonymous-id stitching is built in

The choice is **gated by `NEXT_PUBLIC_ANALYTICS_ENABLED`**. Self-hosters who
don't want any third-party analytics simply leave the env var unset; the app
still mirrors all events to the local `funnel_events` table so the
`/admin/funnel` dashboard keeps working.

### One-time setup

1. Create a PostHog account at <https://us.posthog.com> (or eu.posthog.com).
   The free tier is fine.
2. Create a project. Copy the **Project API key** (starts with `phc_`).
3. Add to `.env.local` / your hosting environment:

   ```dotenv
   NEXT_PUBLIC_ANALYTICS_ENABLED=true
   POSTHOG_API_KEY=phc_your_project_api_key
   # Optional — defaults to PostHog Cloud US
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```

4. In PostHog, build the funnel dashboard from the events listed below. The
   left-most step is `signup_started` and the right-most is
   `first_sync_completed`.

### Self-hosting / opting out

Leave `NEXT_PUBLIC_ANALYTICS_ENABLED` unset. The server-side `track()` helper
becomes a no-op for the PostHog leg, but events still write to the
`funnel_events` table so `/admin/funnel` works.

## Event catalogue

### Provisioning funnel (`piggyback.finance`)

Events fired during signup. Keyed by an anonymous-session ID cookie
(`pb_aid`, set by `/api/analytics/track` on first landing) until
`tenant_ready` fires, then re-keyed by `tenant_id` (currently the Supabase
user ID).

| Event | Where it fires | Status |
|---|---|---|
| `signup_started` | `/signup` mount (`useEffect`) | Wired |
| `google_signed_in` | `/auth/callback` after Supabase code exchange when provider === "google" | Wired |
| `stripe_checkout_started` | Pre-Stripe-checkout link / form | **TODO** (Stripe integration not yet shipped) |
| `stripe_checkout_completed` | Stripe webhook `checkout.session.completed` | **TODO** |
| `supabase_oauth_completed` | Tenant Supabase OAuth callback | **TODO** (multi-tenant Supabase provisioning not yet shipped) |
| `vercel_oauth_completed` | Vercel OAuth callback | **TODO** (multi-tenant Vercel provisioning not yet shipped) |
| `tenant_provisioning_started` | `/onboarding` page render when `has_onboarded === false` | Wired |
| `tenant_ready` | `completeOnboarding` server action | Wired |
| `up_pat_provided` | `connectUpBank` server action after PAT validates | Wired |
| `first_sync_completed` | `/api/upbank/sync` route on the first ever successful sync | Wired |

> The `**TODO**` events are listed in `PROVISIONING_FUNNEL` already. The
> `/admin/funnel` page renders them with 0% conversion until the underlying
> flows ship — that's by design so the funnel shape is visible from day 1.

### In-tenant activation events (`{tenant}.piggyback.finance`)

| Event | Where it fires |
|---|---|
| `first_transaction_seen` | `/activity` page render when the user has ≥1 connected account |
| `first_budget_created` | `createBudget` server action |
| `first_goal_created` | `createGoal` server action |
| `first_penny_message` | `/api/ai/chat` POST |

All four use `trackFirst()` which dedupes against `funnel_events` so the
event only fires the very first time per user.

### Retention (computed via cron, not from app code)

| Event | Cron | Logic |
|---|---|---|
| `returned_d1`  | `/api/cron/funnel` (daily, 01:00 UTC) | `tenant_ready` fired ~1 day ago AND `profiles.last_seen_at` within last 24h |
| `returned_d7`  | same | `tenant_ready` fired ~7 days ago AND last_seen_at within last 24h |
| `returned_d30` | same | `tenant_ready` fired ~30 days ago AND last_seen_at within last 24h |

`profiles.last_seen_at` is bumped by `updateSession` middleware, throttled
to once per hour per user, on authenticated GET navigations.

## /admin/funnel

Server-rendered page at <https://piggyback.finance/admin/funnel>. Reads
directly from the `funnel_events` table (never PostHog) so it always works
even when `NEXT_PUBLIC_ANALYTICS_ENABLED` is unset.

- Drop-off rates per step over the trailing 7 / 30 / 90 days
- Conversion from `signup_started` → `tenant_ready`
- Median time-to-first-sync (delta between `tenant_ready` and
  `first_sync_completed` per user)

Gated by `ADMIN_EMAILS` (comma-separated allow-list). Non-admins are
redirected to `/home` by `src/app/admin/layout.tsx`.

## Cancellation feedback

### Stripe Customer Portal (manual config step)

In Stripe Dashboard → **Settings → Billing → Customer Portal**:

1. Enable **Cancellations**.
2. Toggle on **"Cancellation reasons"** and pick the canned options you want
   (the standard set: too_expensive, missing_features, switched_service,
   unused, customer_service, too_complex, low_quality, other).
3. Set the post-cancel redirect URL to
   `https://piggyback.finance/account/cancel?reason={CANCELLATION_REASON}`
   so the reason is forwarded as a query string.

> If you'd rather configure this via the Stripe API instead of the dashboard:
>
> ```bash
> curl https://api.stripe.com/v1/billing_portal/configurations \
>   -u $STRIPE_SECRET_KEY: \
>   -d "features[customer_update][allowed_updates][]=email" \
>   -d "features[subscription_cancel][enabled]=true" \
>   -d "features[subscription_cancel][cancellation_reason][enabled]=true" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=too_expensive" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=missing_features" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=switched_service" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=unused" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=customer_service" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=too_complex" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=low_quality" \
>   -d "features[subscription_cancel][cancellation_reason][options][]=other"
> ```

### `/account/cancel` page

Server component at `src/app/(app)/account/cancel/page.tsx`. Renders the
free-text "anything we should know?" textarea (`CancelFeedbackForm`).
Submitting:

1. Persists a row to `cancellation_feedback`
   (`reason` from the Stripe query string, `feedback` from the textarea)
2. Emails the operator (`email@benlaurenson.dev`) via Resend if
   `RESEND_API_KEY` is set; otherwise logs a structured JSON line to the
   server console.

### Schema

See `supabase/migrations/20260430120000_phase4_instrumentation.sql` —
adds `funnel_events`, `cancellation_feedback`, and
`profiles.last_seen_at`. RLS is enabled on both new tables; admins read via
the service role from `/admin/funnel` and `/api/cron/funnel`.

## Acceptance test

1. Set `NEXT_PUBLIC_ANALYTICS_ENABLED=false` (or unset). Sign up a fresh
   user, run through onboarding, connect a real Up token. Hit
   `/admin/funnel` (with your email in `ADMIN_EMAILS`) and confirm
   `signup_started → tenant_provisioning_started → tenant_ready →
   up_pat_provided → first_sync_completed` rows appear with sane counts.
2. Set `NEXT_PUBLIC_ANALYTICS_ENABLED=true` plus a real `POSTHOG_API_KEY`
   and repeat. Open PostHog → Live events and confirm the events show up
   keyed by your user ID.
3. Cancel a test Stripe subscription via the Customer Portal. Confirm
   you get redirected to `/account/cancel?reason=…`, submit feedback, and
   see the row in `cancellation_feedback` plus an email at
   `email@benlaurenson.dev` (or a console log line in dev).
