import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { isDemoMode, demoModeResponse } from "@/lib/demo-guard";
import { aiSettingsLimiter } from "@/lib/rate-limiter";

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

  // Rate limit: 5 updates per hour per user
  const rateCheck = aiSettingsLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", retryAfterMs: rateCheck.retryAfterMs },
      { status: 429 }
    );
  }

  const { provider, model, apiKey } = await req.json();

  const updates: Record<string, string> = {};
  if (provider) updates.ai_provider = provider;
  if (model) updates.ai_model = model;
  if (apiKey !== undefined) updates.ai_api_key = apiKey;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
