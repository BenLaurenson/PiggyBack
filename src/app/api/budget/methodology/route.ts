import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

/**
 * Get or update partnership budgeting methodology
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

  // Verify user is member of partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  const { data: methodology } = await supabase
    .from("partnership_budget_methodology")
    .select("*, budgeting_methodologies(*)")
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  return NextResponse.json({
    methodology: methodology?.budgeting_methodologies?.name || 'zero-based',
    data: methodology,
  });
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

  const methodologySchema = z.object({
    partnership_id: z.string().uuid(),
    methodology: z.string().min(1).max(50),
  });
  const parsed = await parseBody(request, methodologySchema);
  if (parsed.response) return parsed.response;
  const { partnership_id, methodology } = parsed.data;

  // Verify user is member of partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnership_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this partnership" }, { status: 403 });
  }

  // Save to profiles table
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      budget_methodology: methodology,
    })
    .eq("id", user.id);

  if (profileError) {
    console.error("Error saving methodology:", profileError);
    return NextResponse.json({ error: "Failed to save methodology" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
