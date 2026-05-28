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
  upAccountIdToAccountType: new Map(),
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

describe("resolveCategoryBatch HOME_LOAN-aware inference", () => {
  // HOME_LOAN accounts produce transactions Up Bank doesn't categorize:
  //   - Drawdown: bank advances funds to settle the property purchase.
  //     Balance-sheet movement, not cash flow. Must be treated as a transfer.
  //   - Interest: charged monthly. Negative amount on the loan account. Should
  //     be a real housing expense, not "Interest Earned".
  //   - Repayment: arrives as a Scheduled Transfer with transferAccount set →
  //     already handled by the existing internal-transfer path.
  // Pre-fix, drawdowns fell through to the genuine-uncategorized branch and
  // appeared as massive negative "spending", and interest charges were
  // classified as "interest" (the Interest Earned category).

  it("HOME_LOAN drawdown becomes external-transfer (excluded from spending)", () => {
    const txn = baseTxn({
      description: "Drawdown",
      transactionType: "Drawdown",
      amount: { currencyCode: "AUD", value: "-439453.54", valueInBaseUnits: -43945354 },
    });
    txn.relationships.account.data = { type: "accounts", id: "up-acc-loan" };
    const ctx = emptyCtx();
    ctx.upAccountIdToAccountType.set("up-acc-loan", "HOME_LOAN");

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "external-transfer",
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("HOME_LOAN interest charge maps to rent-and-mortgage (Housing & Utilities)", () => {
    const txn = baseTxn({
      description: "Interest",
      transactionType: "Interest",
      amount: { currencyCode: "AUD", value: "-1716.18", valueInBaseUnits: -171618 },
    });
    txn.relationships.account.data = { type: "accounts", id: "up-acc-loan" };
    const ctx = emptyCtx();
    ctx.upAccountIdToAccountType.set("up-acc-loan", "HOME_LOAN");

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "rent-and-mortgage",
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("SAVER interest credit still maps to Interest Earned", () => {
    const txn = baseTxn({
      description: "Interest",
      transactionType: "Interest",
      amount: { currencyCode: "AUD", value: "8.32", valueInBaseUnits: 832 },
    });
    txn.relationships.account.data = { type: "accounts", id: "up-acc-saver" };
    const ctx = emptyCtx();
    ctx.upAccountIdToAccountType.set("up-acc-saver", "SAVER");

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "interest",
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("Drawdown on a non-HOME_LOAN account does not get the special treatment", () => {
    // Defensive: only HOME_LOAN drawdowns should become external-transfer.
    // A Drawdown-typed transaction on a TRANSACTIONAL account is unusual but
    // should fall through to the genuine-uncategorized branch (null) rather
    // than masquerade as a transfer.
    const txn = baseTxn({
      description: "Drawdown",
      transactionType: "Drawdown",
      amount: { currencyCode: "AUD", value: "-100.00", valueInBaseUnits: -10000 },
    });
    txn.relationships.account.data = { type: "accounts", id: "up-acc-txn" };
    const ctx = emptyCtx();
    ctx.upAccountIdToAccountType.set("up-acc-txn", "TRANSACTIONAL");

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: null,
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });

  it("HOME_LOAN repayment (Scheduled Transfer with transferAccount) still routes to internal-transfer", () => {
    // Repayments coming FROM a TRANSACTIONAL account already have the
    // transferAccount relationship populated by Up. That path takes
    // precedence over any HOME_LOAN-specific logic.
    const txn = baseTxn({
      description: "Repayment from 2Up Spending",
      transactionType: "Scheduled Transfer",
      amount: { currencyCode: "AUD", value: "2417.00", valueInBaseUnits: 241700 },
    });
    txn.relationships.account.data = { type: "accounts", id: "up-acc-loan" };
    txn.relationships.transferAccount = {
      data: { type: "accounts", id: "up-acc-txn" },
      links: { related: "" },
    };
    const ctx = emptyCtx();
    ctx.upAccountIdToAccountType.set("up-acc-loan", "HOME_LOAN");
    ctx.upAccountIdToDbId.set("up-acc-txn", "local-txn-acc");

    expect(resolveCategoryBatch(txn, ctx, null)).toEqual({
      categoryId: "internal-transfer",
      parentCategoryId: null,
      appliedUserRuleId: null,
      appliedDefaultRuleId: null,
    });
  });
});
