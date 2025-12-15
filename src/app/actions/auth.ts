"use server";

import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { RateLimiter } from "@/lib/rate-limiter";
import { demoActionGuard } from "@/lib/demo-guard";
import { getPlaintextToken } from "@/lib/token-encryption";
import { safeErrorMessage } from "@/lib/safe-error";
import { auditLog, AuditAction } from "@/lib/audit-logger";
import { headers } from "next/headers";

// Per-email limiter: prevents brute force against a specific account
const loginLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 5 attempts per 15 minutes
});

// Per-IP limiter: prevents credential stuffing across many accounts from one IP
const loginIpLimiter = new RateLimiter({
  maxRequests: 15,
  windowMs: 15 * 60 * 1000, // 15 attempts per 15 minutes per IP
});

export async function signIn(email: string, password: string) {
  // Get client IP for IP-based rate limiting
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : headersList.get("x-real-ip") || "unknown";

  // Rate limit by IP to prevent credential stuffing across accounts
  const ipRateCheck = loginIpLimiter.check(ip);
  if (!ipRateCheck.allowed) {
    return { error: "Too many login attempts. Please try again later." };
  }

  // Rate limit by email to prevent per-account brute force
  const rateCheck = loginLimiter.check(email.toLowerCase());
  if (!rateCheck.allowed) {
    return { error: "Too many login attempts. Please try again later." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password" };
  }

  return { success: true };
}

/**
 * Change the authenticated user's password.
 * Verifies the current password before updating.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { success: false, error: "Not authenticated" };
  }

  // Verify current password
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return { success: false, error: "Current password is incorrect" };
  }

  // Update password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return {
      success: false,
      error: safeErrorMessage(updateError, "Failed to change password"),
    };
  }

  auditLog({
    userId: user.id,
    action: AuditAction.PASSWORD_CHANGED,
  });

  // Sign out all sessions so old credentials are invalidated
  await supabase.auth.signOut({ scope: "global" });

  return { success: true };
}

/**
 * Sign out all other sessions for the current user.
 * Keeps the current session active but revokes all others,
 * providing a "log out other devices" feature (L77 mitigation).
 */
export async function signOutOtherSessions(): Promise<{
  success: boolean;
  error?: string;
}> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase.auth.signOut({ scope: "others" });

  if (error) {
    return {
      success: false,
      error: safeErrorMessage(error, "Failed to sign out other sessions"),
    };
  }

  auditLog({
    userId: user.id,
    action: AuditAction.OTHER_SESSIONS_REVOKED,
  });

  return { success: true };
}

/**
 * Properly delete a user account:
 * 1. Deregister Up Bank webhook (if any)
 * 2. Clean up partnership data (preserve for remaining partner)
 * 3. Delete profile (cascades to accounts, transactions, up_api_configs, etc.)
 * 4. Delete auth user via admin API
 */
export async function deleteAccount(): Promise<{
  success: boolean;
  error?: string;
}> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const userId = user.id;

  auditLog({
    userId,
    action: AuditAction.ACCOUNT_DELETED,
  });

  try {
    // -------------------------------------------------------
    // Step 1: Deregister Up Bank webhook (best-effort)
    // -------------------------------------------------------
    // We need the service role client to read up_api_configs because
    // after this point we need it for admin operations anyway.
    // But we can read via the user's own session first since RLS allows it.
    const { data: upConfig } = await supabase
      .from("up_api_configs")
      .select("encrypted_token, webhook_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (upConfig?.webhook_id && upConfig?.encrypted_token) {
      try {
        const apiToken = getPlaintextToken(upConfig.encrypted_token);
        const webhookResponse = await fetch(
          `https://api.up.com.au/api/v1/webhooks/${upConfig.webhook_id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${apiToken}`,
            },
          }
        );
        // 404 = already deleted, which is fine
        if (!webhookResponse.ok && webhookResponse.status !== 404) {
          console.error(
            `[deleteAccount] Failed to deregister Up webhook ${upConfig.webhook_id} for user ${userId}:`,
            webhookResponse.status
          );
        }
      } catch (webhookError) {
        // Best-effort: log but don't block account deletion
        console.error(
          `[deleteAccount] Error deregistering Up webhook for user ${userId}:`,
          webhookError
        );
      }
    }

    // -------------------------------------------------------
    // Step 2: Partnership cleanup
    // -------------------------------------------------------
    // Get the user's partnership membership
    const { data: membership } = await supabase
      .from("partnership_members")
      .select("partnership_id")
      .eq("user_id", userId)
      .maybeSingle();

    const serviceClient = createServiceRoleClient();

    if (membership?.partnership_id) {
      // Count how many members the partnership has
      const { count } = await serviceClient
        .from("partnership_members")
        .select("id", { count: "exact", head: true })
        .eq("partnership_id", membership.partnership_id);

      if (count !== null && count <= 1) {
        // User is the only member — delete the entire partnership.
        // This cascades to all partnership-linked data (budgets, goals, expenses, etc.)
        const { error: partnershipDeleteError } = await serviceClient
          .from("partnerships")
          .delete()
          .eq("id", membership.partnership_id);

        if (partnershipDeleteError) {
          console.error(
            `[deleteAccount] Failed to delete orphan partnership ${membership.partnership_id}:`,
            partnershipDeleteError
          );
        }
      } else {
        // Partner exists — only remove this user's membership row.
        // The partnership and all shared data remain for the partner.
        // The CASCADE on partnership_members.user_id -> profiles.id will
        // handle this when the profile is deleted, but we do it explicitly
        // to be clear about the intent.
        const { error: memberDeleteError } = await serviceClient
          .from("partnership_members")
          .delete()
          .eq("user_id", userId)
          .eq("partnership_id", membership.partnership_id);

        if (memberDeleteError) {
          console.error(
            `[deleteAccount] Failed to remove partnership membership for user ${userId}:`,
            memberDeleteError
          );
        }

        // Clear any pending partner link requests involving this user
        await serviceClient
          .from("partner_link_requests")
          .delete()
          .or(`requester_user_id.eq.${userId},target_user_id.eq.${userId}`);
      }
    }

    // -------------------------------------------------------
    // Step 3: Delete profile (cascades via FK constraints)
    // -------------------------------------------------------
    // This cascades to: accounts (-> transactions), up_api_configs,
    // notifications, partnership_members, budget_item_preferences,
    // category_pin_states, merchant_category_rules, etc.
    // Use service role to bypass RLS and ensure deletion succeeds.
    const { error: profileDeleteError } = await serviceClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileDeleteError) {
      console.error(
        `[deleteAccount] Failed to delete profile for user ${userId}:`,
        profileDeleteError
      );
      return {
        success: false,
        error: safeErrorMessage(
          profileDeleteError,
          "Failed to delete account data"
        ),
      };
    }

    // -------------------------------------------------------
    // Step 4: Delete auth user via admin API
    // -------------------------------------------------------
    const { error: authDeleteError } =
      await serviceClient.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error(
        `[deleteAccount] Failed to delete auth user ${userId}:`,
        authDeleteError
      );
      // Profile is already gone — the auth entry is orphaned but the
      // user can't log in since their profile is deleted. Log the error
      // but don't return failure since the account is effectively deleted.
    }

    // -------------------------------------------------------
    // Step 5: Sign out the current session
    // -------------------------------------------------------
    await supabase.auth.signOut();

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: safeErrorMessage(error, "Failed to delete account"),
    };
  }
}
