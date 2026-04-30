/**
 * Phase 4 instrumentation: canonical event names.
 *
 * Provisioning funnel events fire on piggyback.finance during signup. They are
 * keyed by an anonymous session ID (set as a cookie on first landing) until
 * `tenant_ready` fires, after which we re-key by tenant_id (currently the
 * Supabase user ID).
 *
 * Activation events fire from inside a tenant ({tenant}.piggyback.finance).
 *
 * Retention events (returned_d1/d7/d30) are computed by a cron job from
 * profiles.last_seen_at — they are NOT fired from the app itself.
 */

export const FunnelEvent = {
  // --- Provisioning funnel (piggyback.finance) ---
  SIGNUP_STARTED: "signup_started",
  GOOGLE_SIGNED_IN: "google_signed_in",
  STRIPE_CHECKOUT_STARTED: "stripe_checkout_started",
  STRIPE_CHECKOUT_COMPLETED: "stripe_checkout_completed",
  SUPABASE_OAUTH_COMPLETED: "supabase_oauth_completed",
  VERCEL_OAUTH_COMPLETED: "vercel_oauth_completed",
  TENANT_PROVISIONING_STARTED: "tenant_provisioning_started",
  TENANT_READY: "tenant_ready",
  UP_PAT_PROVIDED: "up_pat_provided",
  FIRST_SYNC_COMPLETED: "first_sync_completed",

  // --- In-tenant activation events ({tenant}.piggyback.finance) ---
  FIRST_TRANSACTION_SEEN: "first_transaction_seen",
  FIRST_BUDGET_CREATED: "first_budget_created",
  FIRST_GOAL_CREATED: "first_goal_created",
  FIRST_PENNY_MESSAGE: "first_penny_message",

  // --- Retention (computed via cron) ---
  RETURNED_D1: "returned_d1",
  RETURNED_D7: "returned_d7",
  RETURNED_D30: "returned_d30",
} as const;

export type FunnelEventName = (typeof FunnelEvent)[keyof typeof FunnelEvent];

/**
 * Ordered list of provisioning funnel steps, used by /admin/funnel to compute
 * step-by-step drop-off rates. Steps that haven't been wired yet (e.g. Stripe,
 * Vercel/Supabase OAuth) are still listed so they show as 0% conversion until
 * the underlying flow ships.
 */
export const PROVISIONING_FUNNEL: FunnelEventName[] = [
  FunnelEvent.SIGNUP_STARTED,
  FunnelEvent.GOOGLE_SIGNED_IN,
  FunnelEvent.STRIPE_CHECKOUT_STARTED,
  FunnelEvent.STRIPE_CHECKOUT_COMPLETED,
  FunnelEvent.SUPABASE_OAUTH_COMPLETED,
  FunnelEvent.VERCEL_OAUTH_COMPLETED,
  FunnelEvent.TENANT_PROVISIONING_STARTED,
  FunnelEvent.TENANT_READY,
  FunnelEvent.UP_PAT_PROVIDED,
  FunnelEvent.FIRST_SYNC_COMPLETED,
];
