/**
 * Tests for the category resolver.
 *
 * Precedence (highest first):
 *   1. User override
 *   2. User merchant rule
 *   3. Up's category
 *   4. Global default rule (admin-curated)
 *   5. Inferred (round-up, salary, transfer, etc.)
 *   6. null
 */

import { describe, expect, it } from "vitest";
import { resolveCategoryBatch, type BatchResolverContext } from "@/lib/resolve-category";
import type { UpTransaction } from "@/lib/up-types";

const baseTxn = (overrides: Partial<UpTransaction["attributes"]> = {}): UpTransaction => ({
  type: "transactions",
  id: "txn-1",
  attributes: {
    status: "SETTLED",
    rawText: null,
    description: "Coffee Shop",
    message: null,
    isCategorizable: true,
    holdInfo: null,
    roundUp: null,
    cashback: null,
    amount: { currencyCode: "AUD", value: "-5.00", valueInBaseUnits: -500 },
    foreignAmount: null,
    cardPurchaseMethod: null,
    settledAt: "2025-06-04T00:00:00+10:00",
    createdAt: "2025-06-04T00:00:00+10:00",
    transactionType: null,
    note: null,
    performingCustomer: null,
    ...overrides,
  },
  relationships: {
    account: { data: { type: "accounts", id: "acc-1" }, links: { related: "" } },
    transferAccount: { data: null, links: { related: "" } },
    category: { data: null, links: { self: "" } },
    parentCategory: { data: null, links: { related: "" } },
    tags: { data: [], links: { self: "" } },
    attachment: { data: null, links: { related: "" } },
  },
});

const emptyCtx = (): BatchResolverContext => ({
  overridesByTxnId: new Map(),
  merchantRulesByDesc: new Map(),
  upAccountIdToDbId: new Map(),
  defaultRulesByPattern: new Map(),
});

describe("resolveCategoryBatch precedence", () => {
  it("Tier 1: override beats merchant rule, Up category, and inference", () => {
    const txn = baseTxn();
    txn.relationships.category.data = { type: "categories", id: "good-life" };
    const ctx = emptyCtx();
    ctx.overridesByTxnId.set("local-id-1", {
      override_category_id: "user-pinned",
      override_parent_category_id: "user-pinned-parent",
    });
    ctx.merchantRulesByDesc.set("Coffee Shop", {
      id: "rule-1",
      category_id: "merchant-rule",
      parent_category_id: null,
    });

    expect(resolveCategoryBatch(txn, ctx, "local-id-1")).toEqual({
      categoryId: "user-pinned",
      parentCategoryId: "user-pinned-parent",
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("Tier 2: merchant rule beats Up category and inference", () => {
    const txn = baseTxn();
    txn.relationships.category.data = { type: "categories", id: "good-life" };
    const ctx = emptyCtx();
    ctx.merchantRulesByDesc.set("Coffee Shop", {
      id: "rule-1",
      category_id: "merchant-rule",
      parent_category_id: "merchant-rule-parent",
    });

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "merchant-rule",
      parentCategoryId: "merchant-rule-parent",
      appliedUserRuleId: "rule-1",
      appliedDefaultRuleId: null,
    });
  });

  it("Tier 3: Up's category wins when no override or rule", () => {
    const txn = baseTxn();
    txn.relationships.category.data = { type: "categories", id: "good-life" };
    txn.relationships.parentCategory.data = { type: "categories", id: "lifestyle" };

    expect(resolveCategoryBatch(txn, emptyCtx(), null)).toEqual({
      categoryId: "good-life",
      parentCategoryId: "lifestyle",
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("Tier 4: global default rule wins when Up has no category", () => {
    const txn = baseTxn({ description: "Coffee Shop" });
    const ctx = emptyCtx();
    ctx.defaultRulesByPattern.set("coffee", {
      id: "default-rule-1",
      merchant_pattern: "coffee",
      category_id: "default-coffee",
      parent_category_id: "lifestyle",
      source: "curated",
      is_active: true,
    });

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "default-coffee",
      parentCategoryId: "lifestyle",
      appliedUserRuleId: null,
      appliedDefaultRuleId: "default-rule-1",
    });
  });

  it("Tier 4 default rule does NOT override Up's category", () => {
    const txn = baseTxn({ description: "Coffee Shop" });
    txn.relationships.category.data = { type: "categories", id: "good-life" };
    const ctx = emptyCtx();
    ctx.defaultRulesByPattern.set("coffee", {
      id: "default-rule-1",
      merchant_pattern: "coffee",
      category_id: "default-coffee",
      parent_category_id: null,
      source: "curated",
      is_active: true,
    });

    expect(resolveCategoryBatch(txn, ctx, null).categoryId).toBe("good-life");
  });

  it("Tier 5 (round-up): inference fires when Up's category is null", () => {
    const txn = baseTxn({
      roundUp: { amount: { currencyCode: "AUD", value: "-0.50", valueInBaseUnits: -50 }, boostPortion: null },
    });
    expect(resolveCategoryBatch(txn, emptyCtx(), null)).toEqual({
      categoryId: "round-up",
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("Tier 5 (transfer): internal-transfer when transferAccount resolves locally", () => {
    const txn = baseTxn();
    txn.relationships.transferAccount.data = { type: "accounts", id: "up-acc-2" };
    const ctx = emptyCtx();
    ctx.upAccountIdToDbId.set("up-acc-2", "local-acc-2");

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "internal-transfer",
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("Tier 5 (salary): salary-income when transactionType=Salary", () => {
    const txn = baseTxn({ transactionType: "Salary", amount: { currencyCode: "AUD", value: "100", valueInBaseUnits: 10_000 } });
    expect(resolveCategoryBatch(txn, emptyCtx(), null).categoryId).toBe("salary-income");
  });

  it("Tier 6: returns null when nothing resolves", () => {
    const txn = baseTxn(); // category null, no roundUp, no transferAccount, no salary marker
    expect(resolveCategoryBatch(txn, emptyCtx(), null)).toEqual({
      categoryId: null,
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("override falls through to next tier when existingTxnId is null", () => {
    // Even if we have an override row keyed by some id, if we don't pass that id
    // (it's a new transaction), tier 1 must be skipped.
    const txn = baseTxn();
    txn.relationships.category.data = { type: "categories", id: "good-life" };
    const ctx = emptyCtx();
    ctx.overridesByTxnId.set("local-id-1", {
      override_category_id: "user-pinned",
      override_parent_category_id: null,
    });

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "good-life",
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });
});
