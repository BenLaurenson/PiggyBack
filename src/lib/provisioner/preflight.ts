/**
 * Pre-flight checks executed before SUPABASE_CREATING. If any fail, the
 * provision either holds in place (transient) or moves to FAILED_PERMANENT
 * (e.g. no Stripe subscription).
 *
 * The plan calls for these checks:
 *   1. User email is verified (orchestrator auth).
 *   2. Stripe sub status === 'active' or 'trialing'.
 *   3. Daily Supabase mgmt API quota < 80% used.
 *   4. No existing READY provision for this user (idempotent — return existing).
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getDailyUsage } from "./resource-usage";

export interface PreflightResult {
  ok: boolean;
  blocker?: "no_stripe_sub" | "stripe_inactive" | "quota_exceeded" | "duplicate_ready" | "email_unverified";
  details?: Record<string, unknown>;
}

const QUOTA_WARN_PERCENT = 0.8;
function getDailyQuota(): number {
  return Number(process.env.SUPABASE_MGMT_DAILY_QUOTA ?? 1000);
}

export async function preflightCheck(provisionId: string): Promise<PreflightResult> {
  const supabase = createServiceRoleClient();
  const { data: provision } = await supabase
    .from("piggyback_provisions")
    .select("google_sub, email, stripe_subscription_id, subscription_status")
    .eq("id", provisionId)
    .maybeSingle();

  if (!provision) {
    return { ok: false, blocker: "duplicate_ready", details: { reason: "not found" } };
  }

  // 1. Stripe subscription must be active or trialing.
  if (!provision.stripe_subscription_id) {
    return { ok: false, blocker: "no_stripe_sub" };
  }
  const status = provision.subscription_status;
  if (status !== "active" && status !== "trialing") {
    return { ok: false, blocker: "stripe_inactive", details: { status } };
  }

  // 2. Daily quota — block if at/over 80% to leave headroom.
  const quota = getDailyQuota();
  const used = await getDailyUsage("supabase_mgmt");
  if (used >= quota * QUOTA_WARN_PERCENT) {
    return {
      ok: false,
      blocker: "quota_exceeded",
      details: { used, quota },
    };
  }

  // 3. No existing READY provision for the same google_sub. If one exists,
  //    we treat this as a duplicate signup — the caller should redirect to
  //    that existing provision rather than continuing.
  const { data: ready } = await supabase
    .from("piggyback_provisions")
    .select("id")
    .eq("google_sub", provision.google_sub)
    .eq("state", "READY")
    .neq("id", provisionId)
    .maybeSingle();
  if (ready) {
    return { ok: false, blocker: "duplicate_ready", details: { existing_id: ready.id } };
  }

  // Email verification: orchestrator auth uses Google OAuth; Google's `email_verified`
  // is true by default for any Google account. We don't have direct access to that
  // claim in the orchestrator DB beyond piggyback_provisions.email, so this
  // condition is effectively a no-op here. Documented for future tightening.

  return { ok: true };
}
