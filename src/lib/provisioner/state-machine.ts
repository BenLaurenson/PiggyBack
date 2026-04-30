/**
 * Provisioning state machine for hosted users.
 *
 * Transitions are idempotent — every step checks whether its work has already
 * been done before doing it again. This means a partial-failed provision can
 * resume from the last good state on retry.
 *
 * State diagram:
 *
 *   NEW
 *    └→ SIGNED_IN          (Google OAuth complete)
 *        └→ SUPABASE_AUTHED  (user authorized our Supabase OAuth app)
 *            └→ VERCEL_AUTHED    (user authorized our Vercel integration)
 *                └→ SUPABASE_PROVISIONED   (project created, ACTIVE_HEALTHY)
 *                    └→ MIGRATIONS_RUN      (initial schema applied)
 *                        └→ VERCEL_PROVISIONED   (project linked to repo)
 *                            └→ ENV_VARS_SET     (Supabase keys + encryption key set)
 *                                └→ DOMAIN_ATTACHED   (subdomain points to project)
 *                                    └→ UP_PAT_PROVIDED  (user pasted Up PAT in their app)
 *                                        └→ WEBHOOK_REGISTERED  (webhook live)
 *                                            └→ READY
 *
 * Error states: FAILED (retryable), CANCELLED (subscription canceled).
 */

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { generateShortId } from "./subdomain";

export type ProvisionState =
  | "NEW"
  | "SIGNED_IN"
  | "SUPABASE_AUTHED"
  | "VERCEL_AUTHED"
  | "SUPABASE_PROVISIONED"
  | "MIGRATIONS_RUN"
  | "VERCEL_PROVISIONED"
  | "ENV_VARS_SET"
  | "DOMAIN_ATTACHED"
  | "UP_PAT_PROVIDED"
  | "WEBHOOK_REGISTERED"
  | "READY"
  | "FAILED"
  | "CANCELLED";

export const STATE_ORDER: ProvisionState[] = [
  "NEW",
  "SIGNED_IN",
  "SUPABASE_AUTHED",
  "VERCEL_AUTHED",
  "SUPABASE_PROVISIONED",
  "MIGRATIONS_RUN",
  "VERCEL_PROVISIONED",
  "ENV_VARS_SET",
  "DOMAIN_ATTACHED",
  "UP_PAT_PROVIDED",
  "WEBHOOK_REGISTERED",
  "READY",
];

export interface ProvisionRow {
  id: string;
  google_sub: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  state: ProvisionState;
  state_detail: string | null;
  state_updated_at: string;
  subdomain_short_id: string | null;
  subdomain_vanity: string | null;
  subdomain_vanity_set_at: string | null;
  supabase_org_id: string | null;
  supabase_project_ref: string | null;
  supabase_project_url: string | null;
  vercel_team_id: string | null;
  vercel_project_id: string | null;
  vercel_deployment_url: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}

/**
 * Find or create a provision row by Google `sub` claim.
 * Idempotent: if a row exists for this user, return it.
 */
export async function upsertProvisionForUser(input: {
  googleSub: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}): Promise<ProvisionRow> {
  const supabase = createServiceRoleClient();

  // Existing?
  const { data: existing } = await supabase
    .from("piggyback_provisions")
    .select("*")
    .eq("google_sub", input.googleSub)
    .maybeSingle();

  if (existing) {
    return existing as ProvisionRow;
  }

  // Generate a fresh short ID with retry-on-collision.
  let shortId = generateShortId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: collision } = await supabase
      .from("piggyback_provisions")
      .select("id")
      .eq("subdomain_short_id", shortId)
      .maybeSingle();
    if (!collision) break;
    shortId = generateShortId();
  }

  const { data: row, error } = await supabase
    .from("piggyback_provisions")
    .insert({
      google_sub: input.googleSub,
      email: input.email,
      display_name: input.displayName ?? null,
      avatar_url: input.avatarUrl ?? null,
      state: "SIGNED_IN",
      subdomain_short_id: shortId,
    })
    .select("*")
    .single();

  if (error || !row) {
    throw new Error(`Failed to insert provision row: ${error?.message ?? "unknown"}`);
  }
  await audit(row.id, "PROVISION_CREATED", { email: input.email });
  return row as ProvisionRow;
}

/**
 * Move a provision to a new state. Records audit row. No-op if already at or
 * beyond the requested state in the linear order (unless going to FAILED/CANCELLED).
 */
export async function transitionState(
  provisionId: string,
  to: ProvisionState,
  detail?: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: current } = await supabase
    .from("piggyback_provisions")
    .select("state")
    .eq("id", provisionId)
    .maybeSingle();

  if (!current) throw new Error(`Provision ${provisionId} not found`);

  const fromIdx = STATE_ORDER.indexOf(current.state as ProvisionState);
  const toIdx = STATE_ORDER.indexOf(to);

  // Always allow moves to FAILED or CANCELLED. Otherwise only allow forward motion.
  const isError = to === "FAILED" || to === "CANCELLED";
  if (!isError && fromIdx >= 0 && toIdx >= 0 && toIdx <= fromIdx) {
    // Already at or beyond — no-op.
    return;
  }

  await supabase
    .from("piggyback_provisions")
    .update({
      state: to,
      state_detail: detail ?? null,
      state_updated_at: new Date().toISOString(),
    })
    .eq("id", provisionId);

  await audit(provisionId, `STATE_${to}`, { detail });

  // Fire the welcome email exactly once on the READY transition. Loaded
  // dynamically so non-orchestrator deploys never pull the Resend module.
  if (to === "READY") {
    try {
      const provision = await getProvisionById(provisionId);
      if (provision?.email) {
        const { sendEmail, welcomeEmail } = await import("@/lib/email");
        const subdomain = provision.subdomain_vanity ?? provision.subdomain_short_id;
        if (subdomain) {
          const msg = welcomeEmail({
            email: provision.email,
            displayName: provision.display_name,
            subdomain,
          });
          await sendEmail({ to: provision.email, ...msg });
          await audit(provisionId, "WELCOME_EMAIL_SENT");
        }
      }
    } catch (err) {
      // Non-fatal: provisioning succeeds even if email fails.
      console.error("Failed to send welcome email:", err);
      await audit(provisionId, "WELCOME_EMAIL_FAILED", { message: String(err) });
    }
  }
}

/** Append-only audit-trail event. */
export async function audit(
  provisionId: string,
  event: string,
  detail?: Record<string, unknown> | null
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("provision_audit").insert({
    provision_id: provisionId,
    event,
    detail: detail ?? null,
  });
}

export async function getProvisionById(id: string): Promise<ProvisionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("piggyback_provisions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as ProvisionRow | null;
}

export async function getProvisionByGoogleSub(googleSub: string): Promise<ProvisionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("piggyback_provisions")
    .select("*")
    .eq("google_sub", googleSub)
    .maybeSingle();
  return (data ?? null) as ProvisionRow | null;
}

export async function getProvisionByStripeCustomer(
  stripeCustomerId: string
): Promise<ProvisionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("piggyback_provisions")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return (data ?? null) as ProvisionRow | null;
}

/** Persist a Stripe customer ID + subscription ID on the provision. */
export async function attachStripeIds(
  provisionId: string,
  ids: { customerId: string; subscriptionId?: string; status?: string }
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("piggyback_provisions")
    .update({
      stripe_customer_id: ids.customerId,
      ...(ids.subscriptionId ? { stripe_subscription_id: ids.subscriptionId } : {}),
      ...(ids.status ? { subscription_status: ids.status } : {}),
    })
    .eq("id", provisionId);
}

/**
 * Mark a subscription as cancelled and schedule subdomain teardown after a
 * grace period (default 14 days).
 */
export async function markSubscriptionCancelled(
  provisionId: string,
  options: { gracePeriodDays?: number; canceledAt?: Date } = {}
): Promise<void> {
  const supabase = createServiceRoleClient();
  const grace = options.gracePeriodDays ?? 14;
  const canceledAt = options.canceledAt ?? new Date();
  const teardownAt = new Date(canceledAt.getTime() + grace * 24 * 60 * 60 * 1000);

  await supabase
    .from("piggyback_provisions")
    .update({
      subscription_status: "canceled",
      subscription_canceled_at: canceledAt.toISOString(),
      subdomain_teardown_at: teardownAt.toISOString(),
      state: "CANCELLED",
      state_updated_at: new Date().toISOString(),
    })
    .eq("id", provisionId);

  await audit(provisionId, "SUBSCRIPTION_CANCELLED", {
    canceledAt: canceledAt.toISOString(),
    teardownAt: teardownAt.toISOString(),
  });
}

// ─── Token vault helpers ────────────────────────────────────────────────────

import { decryptVaultToken, encryptVaultToken } from "./token-vault";

export async function storeOAuthToken(input: {
  provisionId: string;
  provider: "supabase" | "vercel";
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  externalConfigId?: string;
  scopes?: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const expiresAt = input.expiresInSeconds
    ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
    : null;

  await supabase.from("provision_oauth_tokens").upsert(
    {
      provision_id: input.provisionId,
      provider: input.provider,
      encrypted_access_token: encryptVaultToken(input.accessToken),
      encrypted_refresh_token: input.refreshToken
        ? encryptVaultToken(input.refreshToken)
        : null,
      access_token_expires_at: expiresAt,
      external_config_id: input.externalConfigId ?? null,
      scopes: input.scopes ?? null,
    },
    { onConflict: "provision_id,provider" }
  );

  await audit(input.provisionId, `OAUTH_TOKEN_STORED_${input.provider.toUpperCase()}`);
}

export async function readOAuthToken(
  provisionId: string,
  provider: "supabase" | "vercel"
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  externalConfigId: string | null;
} | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("provision_oauth_tokens")
    .select(
      "encrypted_access_token, encrypted_refresh_token, access_token_expires_at, external_config_id"
    )
    .eq("provision_id", provisionId)
    .eq("provider", provider)
    .maybeSingle();

  if (!data) return null;
  return {
    accessToken: decryptVaultToken(data.encrypted_access_token),
    refreshToken: data.encrypted_refresh_token
      ? decryptVaultToken(data.encrypted_refresh_token)
      : null,
    expiresAt: data.access_token_expires_at,
    externalConfigId: data.external_config_id,
  };
}
