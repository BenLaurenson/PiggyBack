import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { detectRecurringTransactions } from "@/lib/recurring-detector";
import { suggestExpenseCategory, suggestExpenseEmoji, suggestMatchPattern } from "@/lib/expense-matcher";
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { autoDetectLimiter, getClientIp, rateLimitKey } from "@/lib/rate-limiter";
import { getPlaintextToken } from "@/lib/token-encryption";
import { sanitizeTransactionDescriptions } from "@/lib/sanitize-ai-input";

/**
 * Auto-detect recurring expenses from transaction history
 * Uses AI when API key is configured, falls back to pattern-based detection
 * GET /api/budget/expenses/auto-detect?partnership_id=xxx
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 requests per hour per user+IP
  const ip = getClientIp(request);
  const rateCheck = autoDetectLimiter.check(rateLimitKey(user.id, ip));
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Auto-detect is limited to 5 requests per hour.",
        retryAfterMs: rateCheck.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 3600000) / 1000)),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");

  if (!partnershipId) {
    return NextResponse.json({ error: "Missing partnership_id" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Get account IDs
  const { data: members } = await supabase
    .from("partnership_members")
    .select("user_id")
    .eq("partnership_id", partnershipId);

  const userIds = members?.map(m => m.user_id) || [];

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .in("user_id", userIds)
    .eq("is_active", true);

  const accountIds = accounts?.map(a => a.id) || [];

  // Get transactions from last 6 months (for pattern detection)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, description, amount_cents, created_at, category_id")
    .in("account_id", accountIds)
    .lt("amount_cents", 0) // Only expenses
    .is("transfer_account_id", null)
    .gte("created_at", sixMonthsAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(2000);

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ expenses: [], ai_enhanced: false });
  }

  // H16: Sanitize transaction descriptions before they flow into AI prompts
  sanitizeTransactionDescriptions(transactions);

  // Get existing expense definitions (to filter out already-defined)
  const { data: existingExpenses } = await supabase
    .from("expense_definitions")
    .select("name, match_pattern")
    .eq("partnership_id", partnershipId)
    .eq("is_active", true)
    .limit(200);

  const existingPatterns = new Set(
    existingExpenses?.map(e => e.match_pattern?.toLowerCase()).filter(Boolean) || []
  );
  const existingNames = new Set(
    existingExpenses?.map(e => e.name?.toLowerCase()).filter(Boolean) || []
  );

  // Fetch category mappings for accurate category suggestions
  const { data: categoryMappings } = await supabase
    .from("category_mappings")
    .select("up_category_id, new_parent_name")
    .order("display_order")
    .limit(200);

  const categoryMap = new Map(
    categoryMappings?.map(m => [m.up_category_id, m.new_parent_name]) || []
  );
  const categoryNames = [...new Set(categoryMappings?.map(m => m.new_parent_name) || [])];

  // Load user's AI settings
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_provider, ai_api_key, ai_model")
    .eq("id", user.id)
    .maybeSingle();

  // Try AI-powered detection if API key is configured
  if (profile?.ai_api_key) {
    try {
      const aiResult = await detectWithAI(
        transactions,
        existingPatterns,
        existingNames,
        categoryNames,
        profile,
      );
      return NextResponse.json({ expenses: aiResult, ai_enhanced: true });
    } catch (err) {
      console.error("[auto-detect] AI detection failed, falling back to pattern-based:", err);
    }
  }

  // Fallback: pattern-based detection
  const recurring = detectRecurringTransactions(transactions);

  const suggestions = recurring
    .filter(r => {
      const pattern = suggestMatchPattern(r.description).toLowerCase();
      return !existingPatterns.has(pattern);
    })
    .map(r => {
      const normalizedDesc = r.description.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
      const sampleTransaction = transactions.find(t =>
        t.description.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim() === normalizedDesc
      );

      const upCategoryId = sampleTransaction?.category_id;
      const modernCategory = upCategoryId ? categoryMap.get(upCategoryId) : null;

      return {
        description: r.description,
        suggested_name: r.description,
        expected_amount_cents: Math.round(r.averageAmount),
        recurrence_type: r.frequency,
        next_due_date: r.nextExpectedDate.toISOString().split('T')[0],
        match_pattern: suggestMatchPattern(r.description),
        suggested_category: modernCategory || suggestExpenseCategory(r.description),
        suggested_emoji: r.emoji || suggestExpenseEmoji(r.description, modernCategory || suggestExpenseCategory(r.description)),
        confidence: r.count >= 5 ? 0.95 : r.count >= 3 ? 0.85 : 0.70,
        detection_count: r.count,
        last_date: r.lastDate.toISOString().split('T')[0],
      };
    });

  return NextResponse.json({ expenses: suggestions, ai_enhanced: false });
}

// =====================================================
// AI-POWERED DETECTION
// =====================================================

interface MerchantSummary {
  description: string;
  count: number;
  totalCents: number;
  avgCents: number;
  firstDate: string;
  lastDate: string;
  avgIntervalDays: number;
  dates: Date[];
}

function buildMerchantSummaries(
  transactions: Array<{ description: string; amount_cents: number; created_at: string }>
): MerchantSummary[] {
  const groups = new Map<string, Array<{ description: string; amount: number; date: Date }>>();

  for (const txn of transactions) {
    const normalized = txn.description
      .toLowerCase()
      .replace(/\d+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!groups.has(normalized)) {
      groups.set(normalized, []);
    }
    groups.get(normalized)!.push({
      description: txn.description,
      amount: Math.abs(txn.amount_cents),
      date: new Date(txn.created_at),
    });
  }

  const summaries: MerchantSummary[] = [];

  for (const [, txns] of groups) {
    if (txns.length < 2) continue;

    txns.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totalCents = txns.reduce((sum, t) => sum + t.amount, 0);
    const avgCents = Math.round(totalCents / txns.length);

    // Calculate average interval
    let totalIntervalDays = 0;
    for (let i = 1; i < txns.length; i++) {
      totalIntervalDays += (txns[i].date.getTime() - txns[i - 1].date.getTime()) / (1000 * 60 * 60 * 24);
    }
    const avgIntervalDays = Math.round(totalIntervalDays / (txns.length - 1));

    summaries.push({
      description: txns[0].description, // Use original description from first occurrence
      count: txns.length,
      totalCents,
      avgCents,
      firstDate: txns[0].date.toISOString().split('T')[0],
      lastDate: txns[txns.length - 1].date.toISOString().split('T')[0],
      avgIntervalDays,
      dates: txns.map(t => t.date),
    });
  }

  // Sort by count descending, cap at 80 merchants
  return summaries.sort((a, b) => b.count - a.count).slice(0, 80);
}

async function detectWithAI(
  transactions: Array<{ description: string; amount_cents: number; created_at: string; category_id?: string | null }>,
  existingPatterns: Set<string>,
  existingNames: Set<string>,
  categoryNames: string[],
  profile: { ai_provider: string | null; ai_api_key: string; ai_model: string | null },
) {
  const summaries = buildMerchantSummaries(transactions);

  if (summaries.length === 0) return [];

  // Build compact merchant summary table
  const merchantTable = summaries.map(s => {
    const avgDollars = (s.avgCents / 100).toFixed(2);
    return `${s.description} | ${s.count}x | $${avgDollars} avg | ${s.firstDate} to ${s.lastDate} | ~${s.avgIntervalDays}d interval`;
  }).join("\n");

  const existingList = existingNames.size > 0
    ? `\nAlready tracked (exclude these):\n${[...existingNames].join(", ")}`
    : "";

  const categoryList = categoryNames.length > 0
    ? `\nAvailable categories: ${categoryNames.join(", ")}`
    : "";

  // Init AI provider (same pattern as ai-categorize.ts)
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

  const result = await generateObject({
    model,
    schema: z.object({
      expenses: z.array(z.object({
        description: z.string().describe("The raw merchant description from the transaction data"),
        suggested_name: z.string().describe("Clean human-readable name (e.g. 'Netflix' not 'NETFLIX.COM')"),
        expected_amount_cents: z.number().describe("Expected amount in cents (positive integer)"),
        recurrence_type: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly"]),
        next_due_date: z.string().describe("Predicted next due date in YYYY-MM-DD format"),
        suggested_category: z.string().describe("Best matching category from the available list"),
        suggested_emoji: z.string().describe("Single emoji representing this expense"),
        confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
        reasoning: z.string().describe("Brief explanation of why this is a recurring expense"),
      })),
    }),
    prompt: `You are a financial analyst identifying recurring bills and subscriptions from Australian bank transaction data.

From the merchant summaries below, identify TRUE recurring expenses — bills, subscriptions, memberships, regular scheduled payments.

DO NOT include:
- Habitual discretionary spending (coffee shops, fuel stations, fast food, supermarkets)
- One-off or irregular purchases that happen to be from the same merchant
- Internal transfers or savings
- ATM withdrawals

Only include expenses where the interval pattern clearly indicates a scheduled recurring charge (e.g. monthly subscription, weekly membership, quarterly insurance).

Merchant summaries (description | occurrence count | avg amount | date range | avg interval):
${merchantTable}
${existingList}
${categoryList}

For next_due_date: calculate based on the last transaction date and the detected interval.
For expected_amount_cents: use the average amount in cents (positive integer, no negatives).
For suggested_category: pick the best match from the available categories list, or use "Other" if none fit.
For suggested_emoji: use a single emoji that represents the service/bill type.
Today's date is ${new Date().toISOString().split('T')[0]}.`,
  });

  // Post-process AI results
  const aiExpenses = result.object.expenses;

  // Build a lookup from summaries for enrichment
  const summaryByDesc = new Map<string, MerchantSummary>();
  for (const s of summaries) {
    const normalized = s.description.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
    summaryByDesc.set(normalized, s);
  }

  return aiExpenses
    .filter(exp => {
      // Filter out results that match existing patterns
      const pattern = suggestMatchPattern(exp.description).toLowerCase();
      return !existingPatterns.has(pattern);
    })
    .map(exp => {
      // Find matching summary for enrichment
      const normalized = exp.description.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
      const summary = summaryByDesc.get(normalized);

      return {
        description: exp.description,
        suggested_name: exp.suggested_name,
        expected_amount_cents: Math.abs(exp.expected_amount_cents),
        recurrence_type: exp.recurrence_type,
        next_due_date: exp.next_due_date,
        match_pattern: suggestMatchPattern(exp.description),
        suggested_category: exp.suggested_category,
        suggested_emoji: exp.suggested_emoji,
        confidence: exp.confidence,
        detection_count: summary?.count ?? 0,
        last_date: summary?.lastDate ?? exp.next_due_date,
        reasoning: exp.reasoning,
      };
    });
}
