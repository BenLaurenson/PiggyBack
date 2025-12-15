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
