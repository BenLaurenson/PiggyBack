import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

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
    .order("next_due_date");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
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
  } = body;

  if (!partnership_id || !name || !category_name || !expected_amount_cents || !recurrence_type || !next_due_date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
