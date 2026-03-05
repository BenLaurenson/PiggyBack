import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/utils/supabase/server";
import { getPlaintextToken } from "@/lib/token-encryption";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: aiSettings } = await supabase
      .from("profiles")
      .select("ai_provider, ai_api_key, ai_model")
      .eq("id", user.id)
      .maybeSingle();

    const provider = aiSettings?.ai_provider || "google";
    const apiKey = aiSettings?.ai_api_key
      ? getPlaintextToken(aiSettings.ai_api_key)
      : null;

    if (!apiKey) {
      return Response.json(
        { error: "No API key configured." },
        { status: 400 }
      );
    }

    let model;
    if (provider === "google") {
      const client = createGoogleGenerativeAI({ apiKey });
      model = client(aiSettings?.ai_model || "gemini-2.0-flash");
    } else if (provider === "openai") {
      const client = createOpenAI({ apiKey });
      model = client.chat(aiSettings?.ai_model || "gpt-4o-mini");
    } else {
      const client = createAnthropic({ apiKey });
      model = client(aiSettings?.ai_model || "claude-sonnet-4-5-20250929");
    }

    const result = await generateText({
      model,
      prompt: "Say hello in one sentence.",
    });

    if (result.text) {
      return Response.json({ success: true, response: result.text });
    }

    return Response.json(
      { error: "No response received from AI provider." },
      { status: 500 }
    );
  } catch (err: unknown) {
    console.error("AI test error:", err);

    let message = "Connection failed. Please check your API key.";
    if (err instanceof Error) {
      const m = err.message.toLowerCase();
      if (
        m.includes("api key") ||
        m.includes("api_key") ||
        m.includes("authentication") ||
        m.includes("unauthorized") ||
        m.includes("permission denied") ||
        m.includes("403") ||
        m.includes("401")
      ) {
        message = "Invalid API key. Please check your key and try again.";
      } else if (
        m.includes("rate limit") ||
        m.includes("429") ||
        m.includes("quota")
      ) {
        message = "Rate limit exceeded. Please try again in a moment.";
      } else if (
        m.includes("model") &&
        (m.includes("not found") || m.includes("not exist") || m.includes("404"))
      ) {
        message = "Model not found. Please check your model setting.";
      } else if (m.includes("not supported") || m.includes("location")) {
        message =
          "Your region may not be supported by this provider. Try a different provider.";
      }
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
