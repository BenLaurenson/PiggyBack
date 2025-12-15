import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { validateFormula } from "@/lib/formula-evaluator";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

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

  const rateCheck = generalApiLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const columnSchema = z.object({
    partnership_id: z.string().uuid(),
    user_id: z.string().uuid(),
    name: z.string().min(1).max(100),
    formula: z.string().min(1).max(500),
    data_type: z.enum(["text", "number", "currency", "percentage"]),
  });
  const parsed = await parseBody(request, columnSchema);
  if (parsed.response) return parsed.response;
  const { partnership_id, user_id, name, formula, data_type } = parsed.data;

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
