import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { parseBody } from "@/lib/validation";
import { generalApiLimiter } from "@/lib/rate-limiter";

/** Verify the transaction belongs to one of the authenticated user's accounts */
async function verifyTransactionOwnership(
  supabase: SupabaseClient,
  transactionId: string,
  userId: string
): Promise<{ error?: NextResponse }> {
  const { data: txn } = await supabase
    .from("transactions")
    .select("account_id")
    .eq("id", transactionId)
    .single();

  if (!txn) {
    return { error: NextResponse.json({ error: "Transaction not found" }, { status: 404 }) };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", txn.account_id)
    .eq("user_id", userId)
    .single();

  if (!account) {
    return { error: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
  }

  return {};
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const tagSchema = z.object({
    transactionId: z.string().uuid(),
    tagName: z.string().min(1).max(50),
  });
  const parsed = await parseBody(request, tagSchema);
  if (parsed.response) return parsed.response;
  const { transactionId, tagName } = parsed.data;

  const trimmedTag = tagName.trim().toLowerCase();
  if (trimmedTag.length === 0) {
    return NextResponse.json(
      { error: "Tag must be 1-50 characters" },
      { status: 400 }
    );
  }

  // Verify the transaction belongs to the user
  const ownership = await verifyTransactionOwnership(supabase, transactionId, user.id);
  if (ownership.error) return ownership.error;

  // Upsert tag (creates if not exists)
  await supabase.from("tags").upsert({ name: trimmedTag }, { onConflict: "name" });

  // Link tag to transaction
  const { error } = await supabase.from("transaction_tags").upsert(
    { transaction_id: transactionId, tag_name: trimmedTag },
    { onConflict: "transaction_id,tag_name" }
  );

  if (error) {
    console.error("Failed to add tag:", error);
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tag: trimmedTag });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const deleteTagSchema = z.object({
    transactionId: z.string().uuid(),
    tagName: z.string().min(1).max(50),
  });
  const parsed = await parseBody(request, deleteTagSchema);
  if (parsed.response) return parsed.response;
  const { transactionId, tagName } = parsed.data;

  // Verify the transaction belongs to the user
  const ownership = await verifyTransactionOwnership(supabase, transactionId, user.id);
  if (ownership.error) return ownership.error;

  const { error } = await supabase
    .from("transaction_tags")
    .delete()
    .eq("transaction_id", transactionId)
    .eq("tag_name", tagName.trim().toLowerCase());

  if (error) {
    console.error("Failed to remove tag:", error);
    return NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
