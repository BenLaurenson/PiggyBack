// Classifies transaction categories as essential or discretionary for Lean FIRE

// ============================================================================
// Essential Categories
// ============================================================================

/** Parent categories considered essential */
const ESSENTIAL_PARENTS = new Set([
  "Housing & Utilities",
  "Transportation",
  "Personal Care & Health",
  "Technology & Communication",
  "Family & Education",
]);

/** Specific child categories that are essential even if parent is not */
const ESSENTIAL_CHILD_OVERRIDES = new Set([
  "Groceries",
]);

/** Specific child categories that are discretionary even if parent is essential */
const DISCRETIONARY_CHILD_OVERRIDES = new Set([
  "Taxis & Share Cars",
  "Restaurants",
  "Takeaway",
]);

// ============================================================================
// Types
// ============================================================================

interface Transaction {
  amount_cents: number;
  category_id: string | null;
  parent_category_id?: string | null;
  is_income?: boolean;
  is_internal_transfer?: boolean;
}

interface CategoryMapping {
  up_category_id: string;
  new_parent_name: string;
  new_child_name: string;
}

export interface SpendingClassification {
  essentialCents: number;
  discretionaryCents: number;
}

// ============================================================================
// Classifier
// ============================================================================

/**
 * Classify transactions into essential vs discretionary spending.
 *
 * Only processes expense transactions (negative amounts, not income/transfers).
 * Uses category mappings to resolve parent/child names.
 */
export function classifySpending(
  transactions: Transaction[],
  categoryMappings: CategoryMapping[]
): SpendingClassification {
  // Build lookup: category_id → { parent, child }
  const categoryLookup = new Map<string, { parent: string; child: string }>();
  for (const mapping of categoryMappings) {
    categoryLookup.set(mapping.up_category_id, {
      parent: mapping.new_parent_name,
      child: mapping.new_child_name,
    });
  }

  let essentialCents = 0;
  let discretionaryCents = 0;

  for (const txn of transactions) {
    // Only classify expenses (negative amounts)
    if (txn.amount_cents >= 0) continue;
    if (txn.is_income) continue;
    if (txn.is_internal_transfer) continue;

    const amount = Math.abs(txn.amount_cents);
    const categoryId = txn.category_id || txn.parent_category_id;

    if (!categoryId) {
      // Uncategorized = discretionary
      discretionaryCents += amount;
      continue;
    }

    const category = categoryLookup.get(categoryId);
    if (!category) {
      // Unknown category = discretionary
      discretionaryCents += amount;
      continue;
    }

    if (isEssential(category.parent, category.child)) {
      essentialCents += amount;
    } else {
      discretionaryCents += amount;
    }
  }

  return { essentialCents, discretionaryCents };
}

/**
 * Determine if a category is essential based on parent + child names
 */
function isEssential(parentName: string, childName: string): boolean {
  // Discretionary overrides take priority
  if (DISCRETIONARY_CHILD_OVERRIDES.has(childName)) return false;

  // Essential child overrides
  if (ESSENTIAL_CHILD_OVERRIDES.has(childName)) return true;

  // Parent-level classification
  return ESSENTIAL_PARENTS.has(parentName);
}
