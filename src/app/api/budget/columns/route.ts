import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { validateFormula } from "@/lib/formula-evaluator";

/**
 * GET /api/budget/columns
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const userId = searchParams.get("user_id");

  if (!partnershipId || !userId || userId !== user.id) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: columns } = await supabase
    .from("custom_budget_columns")
    .select("*")
    .eq("user_id", userId)
    .eq("partnership_id", partnershipId)
    .order("display_order");

  return NextResponse.json({ columns: columns || [] });
}

/**
 * POST /api/budget/columns
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { partnership_id, user_id, name, formula, data_type } = body;

  if (!partnership_id || !user_id || !name || !formula || !data_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const validation = validateFormula(formula);
  if (!validation.valid) {
    return NextResponse.json({ error: `Invalid formula: ${validation.error}` }, { status: 400 });
  }

  const { data: column, error } = await supabase
    .from("custom_budget_columns")
    .insert({
      user_id,
      partnership_id,
      name,
      formula,
      column_type: 'calculated',
      data_type,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create column" }, { status: 500 });
  }

  return NextResponse.json({ column });
}
