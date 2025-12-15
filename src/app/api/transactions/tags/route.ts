import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { transactionId, tagName } = (await request.json()) as {
    transactionId: string;
    tagName: string;
  };

  if (!transactionId || !tagName) {
    return NextResponse.json(
      { error: "transactionId and tagName required" },
      { status: 400 }
    );
  }

  const trimmedTag = tagName.trim().toLowerCase();
  if (trimmedTag.length === 0 || trimmedTag.length > 50) {
    return NextResponse.json(
      { error: "Tag must be 1-50 characters" },
      { status: 400 }
    );
  }

  // Upsert tag (creates if not exists)
  await supabase.from("tags").upsert({ name: trimmedTag }, { onConflict: "name" });

  // Link tag to transaction
  const { error } = await supabase.from("transaction_tags").upsert(
    { transaction_id: transactionId, tag_name: trimmedTag },
    { onConflict: "transaction_id,tag_name" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { transactionId, tagName } = (await request.json()) as {
    transactionId: string;
    tagName: string;
  };

  if (!transactionId || !tagName) {
    return NextResponse.json(
      { error: "transactionId and tagName required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("transaction_tags")
    .delete()
    .eq("transaction_id", transactionId)
    .eq("tag_name", tagName.trim().toLowerCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
