import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Categories that inferCategoryId can return. These don't come from Up Bank's
 * API, so they must exist in our database before transactions reference them.
 */
export const INFERRED_CATEGORIES = [
  { id: "salary-income", name: "Salary & Income" },
  { id: "internal-transfer", name: "Internal Transfer" },
  { id: "external-transfer", name: "External Transfer" },
  { id: "round-up", name: "Round Up Savings" },
  { id: "interest", name: "Interest Earned" },
  { id: "investments", name: "Investments" },
] as const;

/**
 * Ensures the inferred categories exist in the database.
 * Safe to call multiple times — uses upsert with ON CONFLICT DO NOTHING.
 */
export async function ensureInferredCategories(supabase: SupabaseClient) {
  const { error } = await supabase.from("categories").upsert(
    INFERRED_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      parent_category_id: null,
    })),
    { onConflict: "id" }
  );
  if (error) {
    console.error("Failed to ensure inferred categories:", error);
  }
}

/**
 * Infers a category_id for transactions that Up Bank doesn't categorize.
 * This handles internal transfers, round-ups, salary, interest, etc.
 * that Up sends with category_id = null.
 */
export function inferCategoryId({
  upCategoryId,
  transferAccountId,
  roundUpAmountCents,
  transactionType,
  description,
  amountCents,
}: {
  upCategoryId: string | null;
  transferAccountId: string | null;
  roundUpAmountCents: number | null;
  transactionType: string | null;
  description: string;
  amountCents: number;
}): string | null {
  // If Up Bank provided a category, use it
  if (upCategoryId) return upCategoryId;

  // Internal transfer (between Up accounts)
  if (transferAccountId) return "internal-transfer";

  // Round-ups (savings)
  if (roundUpAmountCents != null && roundUpAmountCents !== 0) return "round-up";
  if (transactionType === "Round Up") return "round-up";

  // Salary
  if (transactionType === "Salary") return "salary-income";

  // Interest
  if (transactionType === "Interest") return "interest";

  // Investment platforms
  const descLower = description.toLowerCase();
  if (descLower.includes("pearler") || descLower.includes("vanguard") || descLower.includes("spaceship")) {
    return "investments";
  }

  // External bank transfers
  if (
    transactionType === "Transfer" ||
    transactionType === "Scheduled Transfer"
  ) {
    return "external-transfer";
  }

  // Incoming money (not spending)
  if (
    amountCents > 0 &&
    (transactionType === "Osko Payment Received" ||
      transactionType === "Deposit" ||
      transactionType === "EFTPOS Deposit" ||
      transactionType === "Direct Credit" ||
      transactionType === "Bonus Payment" ||
      transactionType === "Payment Received")
  ) {
    return "salary-income";
  }

  // Genuinely uncategorized — return null
  return null;
}
