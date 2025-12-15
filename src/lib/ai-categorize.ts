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
import { getPlaintextToken } from "@/lib/token-encryption";
import { sanitizeForAI } from "@/lib/sanitize-ai-input";

interface AiCategorizeParams {
  transactionId: string;
  description: string;
  amountCents: number;
  userId: string;
  accountIds: string[];
}

/**
 * Attempt to categorize a transaction via merchant cache or AI.
 * Designed to be called fire-and-forget (never blocks the caller).
 *
 * H42 fix: Checks for existing expense matches before modifying the
 * transaction's category. If a match exists, categorization is skipped
 * to avoid corrupting the expense match relationship.
 */
export async function aiCategorizeTransaction({
  transactionId,
  description,
  amountCents,
  userId,
  accountIds,
}: AiCategorizeParams) {
  const supabase = createServiceRoleClient();

  // H42: If this transaction already has an expense match, skip categorization
  // entirely to avoid corrupting the match. The expense matching system runs
  // before AI categorization in the webhook pipeline, and since this function
  // is fire-and-forget, the match may already exist by the time we run.
  const { data: existingMatch } = await supabase
    .from("expense_matches")
    .select("id")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (existingMatch) {
    return null;
  }

  // H13 fix: Verify that all provided accountIds actually belong to this user
  // before using them in a service-role query. This prevents account ID injection.
  let verifiedAccountIds = accountIds;
  if (accountIds.length > 0) {
    const { data: ownedAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .in("id", accountIds);
    verifiedAccountIds = (ownedAccounts || []).map((a) => a.id);
    if (verifiedAccountIds.length === 0) {
      return null; // No valid accounts — cannot proceed
    }
  }

  // Step 1: Merchant cache — find another transaction with the same description
  // that already has a category assigned
  const { data: cached } = await supabase
    .from("transactions")
    .select("category_id")
    .eq("description", description)
    .in("account_id", verifiedAccountIds)
    .not("category_id", "is", null)
    .limit(1)
    .single();

  if (cached?.category_id) {
    // H42: Re-check for expense match right before writing, in case one was
    // created between the initial check and now.
    const { data: matchBeforeCacheWrite } = await supabase
      .from("expense_matches")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle();
    if (matchBeforeCacheWrite) {
      return null;
    }

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
  const apiKey = getPlaintextToken(profile.ai_api_key);
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
  // H16: Sanitize description before embedding in AI prompt
  const safeDescription = sanitizeForAI(description);
  const result = await generateObject({
    model,
    schema: z.object({
      category_id: z.string().describe("The best matching category ID from the list"),
      confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
    }),
    prompt: `Categorize this Australian bank transaction into one of the categories below.

Transaction: "${safeDescription}" for $${amountDollars} AUD

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

  // H42: Re-check for expense match right before writing. The AI call above
  // can take several seconds, during which an expense match may have been
  // created by a concurrent webhook or batch process.
  const { data: matchBeforeAiWrite } = await supabase
    .from("expense_matches")
    .select("id")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (matchBeforeAiWrite) {
    return null;
  }

  await supabase
    .from("transactions")
    .update({ category_id })
    .eq("id", transactionId);

  return { source: "ai" as const, categoryId: category_id, confidence };
}

