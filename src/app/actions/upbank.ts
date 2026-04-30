"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { getPlaintextToken, encryptToken } from "@/lib/token-encryption";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  createUpApiClient,
  UpUnauthorizedError,
  UpWebhookLimitReachedError,
} from "@/lib/up-api";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";

/**
 * Up Bank Connection & Webhook Management Server Actions
 *
 * @see https://developer.up.com.au/ — official Up developer docs
 * @see /Users/ben/Projects/personal/PiggyBack/docs/up-bank-integration.md
 *
 * Token encryption, connection, and webhook lifecycle. All Up API calls go
 * through `UpApiClient` to share retry logic, typed errors, and SSRF guards.
 */

// Use environment variable for the app URL, fallback for development
const getWebhookBaseUrl = () => {
  // In production, use the configured app URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Vercel automatically sets VERCEL_URL for preview deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // For local development with ngrok or similar tunnel
  if (process.env.WEBHOOK_BASE_URL) {
    return process.env.WEBHOOK_BASE_URL;
  }
  // Default for local development
  return "http://localhost:3000";
};

/**
 * Register a new webhook with Up Bank API
 * Creates webhook and stores credentials in database
 */
export async function registerUpWebhook(): Promise<{
  success?: boolean;
  webhookUrl?: string;
  error?: string;
}> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    const { data: config, error: configError } = await supabase
      .from("up_api_configs")
      .select("encrypted_token, webhook_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (configError || !config?.encrypted_token) {
      return { error: "Up Bank not connected. Please connect your account first." };
    }

    if (config.webhook_id) {
      return { error: "Webhook already registered. Delete it first to re-register." };
    }

    const webhookUrl = `${getWebhookBaseUrl()}/api/upbank/webhook`;
    const apiToken = getPlaintextToken(config.encrypted_token);
    const client = createUpApiClient(apiToken);

    let result;
    try {
      result = await client.createWebhook({
        url: webhookUrl,
        description: "PiggyBack real-time transaction sync",
      });
    } catch (error) {
      if (error instanceof UpUnauthorizedError) {
        return { error: "Up Bank rejected the API token. Please reconnect your Up account." };
      }
      if (error instanceof UpWebhookLimitReachedError) {
        return { error: error.message };
      }
      console.error("Up Bank webhook registration failed:", error);
      return { error: "Failed to register webhook with Up Bank" };
    }

    const { error: updateError } = await supabase
      .from("up_api_configs")
      .update({
        webhook_id: result.data.id,
        webhook_secret: encryptToken(result.data.attributes.secretKey ?? ""),
        webhook_url: webhookUrl,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to store webhook credentials:", updateError);
      // Try to delete the webhook since we couldn't store it
      try {
        await client.deleteWebhook(result.data.id);
      } catch (cleanupError) {
        console.error("Failed to roll back webhook creation:", cleanupError);
      }
      return { error: "Failed to store webhook credentials" };
    }

    revalidatePath("/settings/up-connection");

    return {
      success: true,
      webhookUrl,
    };
  } catch (error) {
    return {
      error: safeErrorMessage(error, "Failed to register webhook"),
    };
  }
}

/**
 * Delete the registered webhook from Up Bank
 * Removes webhook and clears credentials from database
 */
export async function deleteUpWebhook(): Promise<{
  success?: boolean;
  error?: string;
}> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    const { data: config, error: configError } = await supabase
      .from("up_api_configs")
      .select("encrypted_token, webhook_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (configError || !config) {
      return { error: "Up Bank not connected" };
    }

    if (!config.webhook_id) {
      return { error: "No webhook registered" };
    }

    const apiToken = getPlaintextToken(config.encrypted_token);
    const client = createUpApiClient(apiToken);

    try {
      await client.deleteWebhook(config.webhook_id);
    } catch (error) {
      // 404 (already gone) is fine; UpClientError with status 404 is recoverable.
      if (
        error instanceof UpUnauthorizedError ||
        (error instanceof Error && !("status" in error))
      ) {
        // Fall through and clear local state — Up's side is unreachable.
      }
      console.error("Up Bank webhook deletion failed:", error);
      // Continue to clear local data anyway
    }

    const { error: updateError } = await supabase
      .from("up_api_configs")
      .update({
        webhook_id: null,
        webhook_secret: null,
        webhook_url: null,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to clear webhook data:", updateError);
      return { error: "Failed to clear webhook data" };
    }

    revalidatePath("/settings/up-connection");

    return { success: true };
  } catch (error) {
    return {
      error: safeErrorMessage(error, "Failed to delete webhook"),
    };
  }
}

/**
 * Ping the webhook to test it (triggers a PING event from Up Bank)
 */
export async function pingWebhook(): Promise<{
  success?: boolean;
  error?: string;
}> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    const { data: config } = await supabase
      .from("up_api_configs")
      .select("encrypted_token, webhook_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!config?.webhook_id) {
      return { error: "No webhook registered" };
    }

    const apiToken = getPlaintextToken(config.encrypted_token);
    const client = createUpApiClient(apiToken);

    try {
      await client.pingWebhook(config.webhook_id);
    } catch (error) {
      if (error instanceof UpUnauthorizedError) {
        return { error: "Up Bank rejected the API token. Please reconnect your Up account." };
      }
      return { error: "Failed to ping webhook" };
    }

    return { success: true };
  } catch (error) {
    return {
      error: safeErrorMessage(error, "Failed to ping webhook"),
    };
  }
}

/**
 * Connect UP Bank account by validating and encrypting the API token
 * Token is encrypted server-side before storage
 */
export async function connectUpBank(plaintextToken: string): Promise<{
  success?: boolean;
  error?: string;
}> {
  const blocked = demoActionGuard();
  if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    // 1. Validate token via the typed Up client
    const client = createUpApiClient(plaintextToken);
    try {
      await client.ping();
    } catch (error) {
      if (error instanceof UpUnauthorizedError) {
        return { error: "Invalid API token. Please check and try again." };
      }
      return {
        error: safeErrorMessage(error, "Could not reach Up Bank. Please try again later."),
      };
    }

    // 2. Encrypt the token before storage — require encryption key
    if (!process.env.UP_API_ENCRYPTION_KEY) {
      return { error: "Server encryption is not configured. Cannot store bank tokens securely." };
    }
    const tokenToStore = encryptToken(plaintextToken);

    // 3. Store token via upsert
    const { error: saveError } = await supabase
      .from("up_api_configs")
      .upsert(
        {
          user_id: user.id,
          encrypted_token: tokenToStore,
          is_active: true,
        },
        { onConflict: "user_id" }
      );

    if (saveError) {
      return { error: safeErrorMessage(saveError, "Failed to connect Up Bank") };
    }

    // Phase 4 funnel: up_pat_provided fires once the user has handed us a
    // valid Up Bank Personal Access Token. The follow-up first_sync_completed
    // event fires from the /api/upbank/sync route once the bulk sync finishes.
    void track(FunnelEvent.UP_PAT_PROVIDED, {
      userId: user.id,
      tenantId: user.id,
    });

    return { success: true };
  } catch (error) {
    return {
      error: safeErrorMessage(error, "Failed to connect Up Bank"),
    };
  }
}
