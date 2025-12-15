import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

const EMOJI_KEYWORDS: [string[], string][] = [
  [["rent", "real estate", "mortgage", "housing", "apartment"], "🏠"],
  [["gym", "fitness", "sport", "minres"], "🏋️"],
  [["crossfit", "wolves", "workout", "training"], "💪"],
  [["internet", "nbn", "belong", "broadband", "wifi"], "📡"],
  [["phone", "mobile", "telstra", "optus", "vodafone"], "📱"],
  [["electricity", "power", "energy", "synergy", "gas", "water", "utilities"], "⚡"],
  [["insurance", "rac", "nrma", "allianz", "cover"], "🛡️"],
  [["transport", "rego", "registration", "license"], "🚗"],
  [["netflix", "disney", "stan", "streaming", "spotify", "youtube", "binge"], "🎬"],
  [["ai", "perplexity", "chatgpt", "openai", "claude", "copilot"], "🤖"],
  [["vpn", "torbox", "privacy", "security", "nord"], "🔒"],
  [["email", "proton", "mail", "fastmail"], "📧"],
  [["domain", "porkbun", "cloudflare", "hosting", "server"], "🌐"],
  [["music", "apple music"], "🎵"],
  [["storage", "icloud", "dropbox", "google one", "onedrive"], "☁️"],
  [["grocery", "woolworths", "coles", "aldi", "iga"], "🛒"],
  [["health", "medical", "doctor", "dental", "pharmacy"], "🏥"],
  [["child", "school", "daycare", "education", "tuition"], "📚"],
  [["pet", "vet", "animal"], "🐾"],
  [["subscription", "membership"], "📦"],
];

function inferExpenseEmoji(name: string, categoryName?: string): string {
  const searchText = `${name} ${categoryName || ""}`.toLowerCase();
  for (const [keywords, emoji] of EMOJI_KEYWORDS) {
    if (keywords.some((kw) => searchText.includes(kw))) return emoji;
  }
  return "📋";
}

/**
 * GET - List expense definitions
 * POST - Create expense definition
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Fetch expenses
  const { data: expenses, error } = await supabase
    .from("expense_definitions")
    .select("*")
    .eq("partnership_id", partnershipId)
    .eq("is_active", true)
    .order("next_due_date")
    .limit(200);

  if (error) {
    console.error("Failed to fetch expenses:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }

  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const expenseSchema = z.object({
    partnership_id: z.string().uuid(),
    name: z.string().min(1).max(200),
    merchant_name: z.string().max(200).optional(),
    linked_up_transaction_id: z.string().uuid().optional(),
    category_name: z.string().min(1).max(100),
    expected_amount_cents: z.number().int(),
    recurrence_type: z.string().min(1).max(50),
    next_due_date: z.string().min(1).refine((val) => {
      return /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(new Date(val).getTime());
    }, { message: "next_due_date must be a valid date in YYYY-MM-DD format" }),
    match_pattern: z.string().max(500).optional(),
    emoji: z.string().max(10).optional(),
    notes: z.string().max(1000).optional(),
    auto_detected: z.boolean().optional(),
  });
  const parsed = await parseBody(request, expenseSchema);
  if (parsed.response) return parsed.response;
  const {
    partnership_id,
    name,
    merchant_name,
    linked_up_transaction_id,
    category_name,
    expected_amount_cents,
    recurrence_type,
    next_due_date,
    match_pattern,
    emoji,
    notes,
    auto_detected,
  } = parsed.data;

  // Verify membership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Create expense
  const { data: expense, error } = await supabase
    .from("expense_definitions")
    .insert({
      partnership_id,
      name,
      merchant_name: merchant_name || name,
      linked_up_transaction_id,
      category_name,
      expected_amount_cents,
      recurrence_type,
      next_due_date,
      match_pattern,
      emoji: emoji || inferExpenseEmoji(name, category_name),
      notes,
      auto_detected: auto_detected || false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create expense:", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }

  // Auto-match all historical transactions if merchant_name or match_pattern exists
  // This backfills all past payments for this expense
  const hasMatchCriteria = merchant_name || match_pattern || name;
  if (expense && hasMatchCriteria) {
    try {
      const { matchExpenseToTransactions } = await import('@/lib/match-expense-transactions');
      const matchResult = await matchExpenseToTransactions(expense.id, partnership_id, {
        amountTolerancePercent: 10, // Match within ±10% of expected amount
        limitMonths: null, // Search all history
      });
    } catch (matchError) {
      console.error('Error matching transactions:', matchError);
      // Don't fail creation if matching fails
    }
  }

  return NextResponse.json({ success: true, expense });
}
