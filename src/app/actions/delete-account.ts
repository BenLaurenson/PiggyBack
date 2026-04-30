"use server";

/**
 * Delete-my-account flow for hosted users.
 *
 * What it does:
 *   1. Cancels the Stripe subscription at period-end.
 *   2. Schedules subdomain teardown for 14 days from now.
 *   3. Marks the provision row CANCELLED.
 *   4. Deletes the OAuth refresh tokens (so we can no longer touch their
 *      Supabase or Vercel).
 *
 * What it deliberately doesn't do:
 *   - Touch the user's Supabase project (their data, they keep it).
 *   - Touch the user's Vercel project (their deploy, they keep it).
 *   - Delete the auth.users row (so they can sign in to undo if they
 *     change their mind during the grace period).
 */

import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  audit,
  getProvisionById,
  markSubscriptionCancelled,
} from "@/lib/provisioner/state-machine";
import { safeErrorMessage } from "@/lib/safe-error";

export interface DeleteAccountResult {
  success?: boolean;
  error?: string;
}

export async function deleteAccount(input: {
  provisionId: string;
}): Promise<DeleteAccountResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const provision = await getProvisionById(input.provisionId);
    if (!provision) return { error: "Provision not found" };
    if (provision.google_sub !== user.id) {
      return { error: "Forbidden" };
    }

    // 1. Cancel Stripe subscription (graceful: at period end)
    if (provision.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
      try {
        await fetch(
          `https://api.stripe.com/v1/subscriptions/${provision.stripe_subscription_id}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ cancel_at_period_end: "true" }).toString(),
          }
        );
      } catch (err) {
        // Don't fail the whole deletion just because Stripe is down.
        console.error("Failed to cancel Stripe subscription:", err);
      }
    }

    // 2. Mark CANCELLED + schedule subdomain teardown
    await markSubscriptionCancelled(provision.id, { gracePeriodDays: 14 });

    // 3. Delete OAuth tokens (revoke our ability to touch their resources)
    const service = createServiceRoleClient();
    await service
      .from("provision_oauth_tokens")
      .delete()
      .eq("provision_id", provision.id);

    await audit(provision.id, "ACCOUNT_DELETION_REQUESTED", {
      googleSub: user.id,
      gracePeriodDays: 14,
    });

    return { success: true };
  } catch (error) {
    return { error: safeErrorMessage(error, "Failed to delete account") };
  }
}
