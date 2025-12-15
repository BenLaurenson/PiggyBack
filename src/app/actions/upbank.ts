"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { getPlaintextToken, encryptToken } from "@/lib/token-encryption";
import { safeErrorMessage } from "@/lib/safe-error";

/**
 * Up Bank Connection & Webhook Management Server Actions
 * Handles token encryption, connection, and webhook lifecycle
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

interface UpWebhookResponse {
  data: {
    type: "webhooks";
    id: string;
    attributes: {
      url: string;
      description: string;
      secretKey: string;
      createdAt: string;
    };
  };
}

/**
 * Register a new webhook with Up Bank API
 * Creates webhook and stores credentials in database
 */
export async function registerUpWebhook(): Promise<{
  success?: boolean;
  webhookUrl?: string;
  error?: string;
}> {
  const blocked = demoActionGuard(); if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    // 1. Get user's Up API token
    const { data: config, error: configError } = await supabase
      .from("up_api_configs")
      .select("encrypted_token, webhook_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (configError || !config?.encrypted_token) {
      return { error: "Up Bank not connected. Please connect your account first." };
    }

    // Check if webhook already exists
    if (config.webhook_id) {
      return { error: "Webhook already registered. Delete it first to re-register." };
    }

    // 2. Register webhook with Up Bank API
    const webhookUrl = `${getWebhookBaseUrl()}/api/upbank/webhook`;
    const apiToken = getPlaintextToken(config.encrypted_token);

    const response = await fetch("https://api.up.com.au/api/v1/webhooks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            url: webhookUrl,
            description: "PiggyBack real-time transaction sync",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Up Bank webhook registration failed:", errorData);
      return { error: "Failed to register webhook with Up Bank" };
    }

    const result: UpWebhookResponse = await response.json();

    // 3. Store webhook ID and secret in database
    const { error: updateError } = await supabase
      .from("up_api_configs")
      .update({
        webhook_id: result.data.id,
        webhook_secret: encryptToken(result.data.attributes.secretKey),
        webhook_url: webhookUrl,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to store webhook credentials:", updateError);
      // Try to delete the webhook since we couldn't store it
      await fetch(`https://api.up.com.au/api/v1/webhooks/${result.data.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });
      return { error: "Failed to store webhook credentials" };
    }

    revalidatePath("/settings/up-connection");

    return {
      success: true,
      webhookUrl
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
  const blocked = demoActionGuard(); if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    // 1. Get user's webhook config
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

    // 2. Delete webhook from Up Bank API
    const apiToken = getPlaintextToken(config.encrypted_token);
    const response = await fetch(
      `https://api.up.com.au/api/v1/webhooks/${config.webhook_id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    // 404 means webhook was already deleted, which is fine
    if (!response.ok && response.status !== 404) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Up Bank webhook deletion failed:", errorData);
      // Continue to clear local data anyway
    }

    // 3. Clear webhook data from database
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
  const blocked = demoActionGuard(); if (blocked) return { success: false, error: blocked.error };
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
    const response = await fetch(
      `https://api.up.com.au/api/v1/webhooks/${config.webhook_id}/ping`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    if (!response.ok) {
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
  const blocked = demoActionGuard(); if (blocked) return { success: false, error: blocked.error };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated" };
    }

    // 1. Validate token with UP Bank API
    const response = await fetch("https://api.up.com.au/api/v1/util/ping", {
      headers: { Authorization: `Bearer ${plaintextToken}` },
    });

    if (!response.ok) {
      return { error: "Invalid API token. Please check and try again." };
    }

    // 2. Encrypt the token before storage — require encryption key
    if (!process.env.UP_API_ENCRYPTION_KEY) {
      return { error: "Server encryption is not configured. Cannot store bank tokens securely." };
    }
    const tokenToStore = encryptToken(plaintextToken);

    // 3. Store token directly via upsert
    const { error: saveError } = await supabase
      .from("up_api_configs")
      .upsert({
        user_id: user.id,
        encrypted_token: tokenToStore,
        is_active: true,
      }, { onConflict: "user_id" });

    if (saveError) {
      return { error: safeErrorMessage(saveError, "Failed to connect Up Bank") };
    }

    return { success: true };
  } catch (error) {
    return {
      error: safeErrorMessage(error, "Failed to connect Up Bank"),
    };
  }
}
