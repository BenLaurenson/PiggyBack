/**
 * AI-powered transaction categorization.
 *
 * When rule-based inference fails, this module:
 * 1. Checks merchant cache (other transactions with same description)
 * 2. Falls back to AI model using the user's configured provider
 */

import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

interface AiCategorizeParams {
  transactionId: string;
  description: string;
  amountCents: number;
  userId: string;
}

/**
 * Attempt to categorize a transaction via merchant cache or AI.
 * Designed to be called fire-and-forget (never blocks the caller).
 */
export async function aiCategorizeTransaction({
  transactionId,
  description,
  amountCents,
  userId,
}: AiCategorizeParams) {
  const supabase = createServiceRoleClient();

  // Step 1: Merchant cache — find another transaction with the same description
  // that already has a category assigned
  const { data: cached } = await supabase
    .from("transactions")
    .select("category_id")
    .eq("description", description)
    .not("category_id", "is", null)
    .limit(1)
    .single();

  if (cached?.category_id) {
    await supabase
      .from("transactions")
      .update({ category_id: cached.category_id })
      .eq("id", transactionId);
    return { source: "cache" as const, categoryId: cached.category_id };
  }

  // Step 2: Load user's AI settings
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_provider, ai_api_key, ai_model")
    .eq("id", userId)
    .single();

  if (!profile?.ai_api_key) {
    return null;
  }

  // Step 3: Load all category mappings to build whitelist
  const { data: categories } = await supabase
    .from("category_mappings")
    .select("up_category_id, new_parent_name, new_child_name");

  if (!categories || categories.length === 0) {
    return null;
  }

  const categoryIds = categories.map((c) => c.up_category_id);
  const categoryList = categories
    .map((c) => `${c.up_category_id}: ${c.new_parent_name} > ${c.new_child_name}`)
    .join("\n");

  // Step 4: Init AI provider
  const provider = profile.ai_provider || "google";
  const apiKey = profile.ai_api_key;
  let model;

  if (provider === "google") {
    const client = createGoogleGenerativeAI({ apiKey });
    model = client(profile.ai_model || "gemini-2.0-flash");
  } else if (provider === "openai") {
    const client = createOpenAI({ apiKey });
    model = client.chat(profile.ai_model || "gpt-4o-mini");
  } else {
    const client = createAnthropic({ apiKey });
    model = client(profile.ai_model || "claude-sonnet-4-5-20250929");
  }

  // Step 5: Call AI with structured output
  const amountDollars = (Math.abs(amountCents) / 100).toFixed(2);
  const result = await generateObject({
    model,
    schema: z.object({
      category_id: z.string().describe("The best matching category ID from the list"),
      confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
    }),
    prompt: `Categorize this Australian bank transaction into one of the categories below.

Transaction: "${description}" for $${amountDollars} AUD

Categories:
${categoryList}

Pick the single best category_id and your confidence (0-1). If unsure, use a lower confidence.`,
  });

  const { category_id, confidence } = result.object;

  // Step 6: Validate and apply
  if (!categoryIds.includes(category_id)) {
    return null;
  }

  if (confidence < 0.5) {
    return null;
  }

  await supabase
    .from("transactions")
    .update({ category_id })
    .eq("id", transactionId);

  return { source: "ai" as const, categoryId: category_id, confidence };
}

