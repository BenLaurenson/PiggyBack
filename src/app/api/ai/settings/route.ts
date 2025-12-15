import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { isDemoMode, demoModeResponse } from "@/lib/demo-guard";
import { aiSettingsLimiter, getClientIp, rateLimitKey } from "@/lib/rate-limiter";
import { encryptToken } from "@/lib/token-encryption";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("ai_provider, ai_model, ai_api_key")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    provider: data?.ai_provider || "google",
    model: data?.ai_model || "",
    hasApiKey: !!data?.ai_api_key,
  });
}

export async function POST(req: Request) {
  if (isDemoMode()) return demoModeResponse();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 updates per hour per user+IP
  const ip = getClientIp(req);
  const rateCheck = aiSettingsLimiter.check(rateLimitKey(user.id, ip));
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", retryAfterMs: rateCheck.retryAfterMs },
      { status: 429 }
    );
  }

  const { provider, model, apiKey } = await req.json();

  const ALLOWED_PROVIDERS = ["google", "openai", "anthropic"];

  if (provider && !ALLOWED_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { error: "Invalid provider" },
      { status: 400 }
    );
  }

  if (model && (typeof model !== "string" || model.length === 0 || model.length > 100)) {
    return NextResponse.json(
      { error: "Invalid model" },
      { status: 400 }
    );
  }

  const updates: Record<string, string | null> = {};
  if (provider) updates.ai_provider = provider;
  if (model) updates.ai_model = model;
  if (apiKey !== undefined) {
    if (apiKey && !process.env.UP_API_ENCRYPTION_KEY) {
      console.error("UP_API_ENCRYPTION_KEY not configured, cannot store API key");
      return NextResponse.json(
        { error: "Unable to store API key securely. Please contact support." },
        { status: 500 }
      );
    }
    updates.ai_api_key = apiKey ? encryptToken(apiKey) : null;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update AI settings:", error);
    return NextResponse.json(
      { error: "Failed to update AI settings" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
