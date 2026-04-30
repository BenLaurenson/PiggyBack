/**
 * Category resolution for Up Bank transactions.
 *
 * Precedence (highest first):
 *   1. User override (transaction_category_overrides table)
 *   2. User merchant rule (merchant_category_rules table)
 *   3. Up Bank's category (transaction.relationships.category)
 *   4. Global default rule (merchant_default_rules table — admin-curated)
 *   5. Inferred category (round-up, salary, transfer, etc. — see infer-category.ts)
 *   6. null (genuinely uncategorized — eligible for AI fallback)
 *
 * Used by both the webhook handler (single transaction) and the sync route
 * (batch transactions). The batch shape pre-loads overrides/rules to avoid
 * an N+1 query pattern.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { inferCategoryId } from "./infer-category";
import type { UpTransaction } from "./up-types";
import {
  findDefaultRuleForDescription,
  loadMerchantDefaultRules,
  type MerchantDefaultRule,
} from "./merchant-default-rules";

export interface CategoryResolution {
  categoryId: string | null;
  parentCategoryId: string | null;
  /** ID of the user merchant_category_rules row applied, if any. */
  appliedUserRuleId: string | null;
  /** ID of the global merchant_default_rules row applied, if any. */
  appliedDefaultRuleId: string | null;
}

/**
 * Pre-loaded context for batch resolution. Build once per sync, reuse across
 * all transactions in the run.
 */
export interface BatchResolverContext {
  /** Map: existing transaction.id (PiggyBack PK) → override row. */
  overridesByTxnId: Map<string, { override_category_id: string; override_parent_category_id: string | null }>;
  /** Map: merchant_description → user rule row. */
  merchantRulesByDesc: Map<string, { id: string; category_id: string; parent_category_id: string | null }>;
  /** Map: up_account_id → PiggyBack accounts.id, for transfer-account resolution. */
  upAccountIdToDbId: Map<string, string>;
  /** Pre-loaded global default rules (from merchant_default_rules). */
  defaultRulesByPattern: Map<string, MerchantDefaultRule>;
}

/**
 * Resolve final category for a single transaction in a batch context.
 *
 * @param txn — The Up transaction.
 * @param ctx — Pre-loaded overrides, merchant rules, account-id map.
 * @param existingTxnId — If we've already persisted this transaction before
 *   (i.e., this is a re-sync), pass the local PK so we can check overrides.
 */
export function resolveCategoryBatch(
  txn: UpTransaction,
  ctx: BatchResolverContext,
  existingTxnId: string | null
): CategoryResolution {
  // Tier 1: user override (highest priority)
  if (existingTxnId) {
    const override = ctx.overridesByTxnId.get(existingTxnId);
    if (override) {
      return {
        categoryId: override.override_category_id,
        parentCategoryId: override.override_parent_category_id,
        appliedUserRuleId: null,
        appliedDefaultRuleId: null,
      };
    }
  }

  // Tier 2: user merchant rule
  const merchantRule = ctx.merchantRulesByDesc.get(txn.attributes.description);
  if (merchantRule) {
    return {
      categoryId: merchantRule.category_id,
      parentCategoryId: merchantRule.parent_category_id,
      appliedUserRuleId: merchantRule.id,
      appliedDefaultRuleId: null,
    };
  }

  // Tier 3: Up's own category
  if (txn.relationships.category.data?.id) {
    return {
      categoryId: txn.relationships.category.data.id,
      parentCategoryId: txn.relationships.parentCategory.data?.id ?? null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    };
  }

  // Tier 4: global default rule (admin-curated, only when Up has no category)
  if (txn.attributes.description) {
    const defaultRule = findDefaultRuleForDescription(
      txn.attributes.description,
      ctx.defaultRulesByPattern
    );
    if (defaultRule) {
      return {
        categoryId: defaultRule.category_id,
        parentCategoryId: defaultRule.parent_category_id,
        appliedUserRuleId: null,
        appliedDefaultRuleId: defaultRule.id,
      };
    }
  }

  // Tier 5: PiggyBack-side inference
  const transferAccountId = txn.relationships.transferAccount?.data?.id
    ? ctx.upAccountIdToDbId.get(txn.relationships.transferAccount.data.id) ?? null
    : null;

  const inferred = inferCategoryId({
    upCategoryId: null,
    transferAccountId,
    roundUpAmountCents: txn.attributes.roundUp?.amount?.valueInBaseUnits ?? null,
    transactionType: txn.attributes.transactionType,
    description: txn.attributes.description,
    amountCents: txn.attributes.amount.valueInBaseUnits,
  });

  return {
    categoryId: inferred,
    parentCategoryId: null,
    appliedUserRuleId: null,
    appliedDefaultRuleId: null,
  };
}

/**
 * Single-transaction variant for the webhook path. Loads override/rule
 * directly from the database. Slower per-call but the right shape when
 * we're processing one event at a time.
 *
 * @param txn — The Up transaction.
 * @param ctx — User context (used for merchant-rule scoping).
 */
export async function resolveCategorySingle(
  txn: UpTransaction,
  ctx: {
    userId: string;
    supabase: SupabaseClient;
    /** PiggyBack accounts.id of the transfer-account, if any. */
    transferAccountId: string | null;
    /** Existing PiggyBack transactions.id for this Up transaction, if it's a re-sync. */
    existingTxnId: string | null;
  }
): Promise<CategoryResolution> {
  // Tier 1: user override (highest priority)
  if (ctx.existingTxnId) {
    const { data: override } = await ctx.supabase
      .from("transaction_category_overrides")
      .select("override_category_id, override_parent_category_id")
      .eq("transaction_id", ctx.existingTxnId)
      .maybeSingle();
    if (override) {
      return {
        categoryId: override.override_category_id,
        parentCategoryId: override.override_parent_category_id,
        appliedUserRuleId: null,
        appliedDefaultRuleId: null,
      };
    }
  }

  // Tier 2: user merchant rule
  const { data: merchantRule } = await ctx.supabase
    .from("merchant_category_rules")
    .select("id, category_id, parent_category_id")
    .eq("user_id", ctx.userId)
    .eq("merchant_description", txn.attributes.description)
    .maybeSingle();
  if (merchantRule) {
    return {
      categoryId: merchantRule.category_id,
      parentCategoryId: merchantRule.parent_category_id,
      appliedUserRuleId: merchantRule.id,
      appliedDefaultRuleId: null,
    };
  }

  // Tier 3: Up's own category
  if (txn.relationships.category.data?.id) {
    return {
      categoryId: txn.relationships.category.data.id,
      parentCategoryId: txn.relationships.parentCategory.data?.id ?? null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    };
  }

  // Tier 4: global default rule (admin-curated, only when Up has no category)
  if (txn.attributes.description) {
    const { byPattern } = await loadMerchantDefaultRules();
    const defaultRule = findDefaultRuleForDescription(
      txn.attributes.description,
      byPattern
    );
    if (defaultRule) {
      return {
        categoryId: defaultRule.category_id,
        parentCategoryId: defaultRule.parent_category_id,
        appliedUserRuleId: null,
        appliedDefaultRuleId: defaultRule.id,
      };
    }
  }

  // Tier 5: inference
  const inferred = inferCategoryId({
    upCategoryId: null,
    transferAccountId: ctx.transferAccountId,
    roundUpAmountCents: txn.attributes.roundUp?.amount?.valueInBaseUnits ?? null,
    transactionType: txn.attributes.transactionType,
    description: txn.attributes.description,
    amountCents: txn.attributes.amount.valueInBaseUnits,
  });

  return {
    categoryId: inferred,
    parentCategoryId: null,
    appliedUserRuleId: null,
    appliedDefaultRuleId: null,
  };
}

/**
 * Defensive insert: if Up's transaction references a category ID that we
 * don't have locally yet (e.g., Up added a new category since our last
 * `/categories` sync), insert a stub row to satisfy the FK. The next
 * `/categories` sync will fill in the proper name.
 */
export async function ensureCategoryExists(
  supabase: SupabaseClient,
  categoryId: string | null
): Promise<void> {
  if (!categoryId) return;
  // Use insert-on-conflict-do-nothing semantics. If the row already exists, nothing changes.
  await supabase
    .from("categories")
    .upsert(
      { id: categoryId, name: categoryId, parent_category_id: null },
      { onConflict: "id", ignoreDuplicates: true }
    );
}
