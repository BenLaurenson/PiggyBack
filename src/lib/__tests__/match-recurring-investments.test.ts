import { describe, it, expect, vi } from "vitest";
import { matchTransactionToRecurringInvestments } from "../match-recurring-investments";

/**
 * Tests for the webhook → recurring investment match path.
 *
 * We mock the Supabase client at the call-site level since the function
 * only uses .from(...).select(...).eq(...).eq(...) and .from(...).insert(...).
 */

function makeMockSupabase(opts: {
  rules: Array<{
    id: string;
    asset_id: string;
    amount_cents: number;
    merchant_pattern: string;
  }>;
  insertImpl?: (row: any) => { error: { code?: string; message: string } | null };
}) {
  const inserts: any[] = [];
  const insertImpl = opts.insertImpl ?? (() => ({ error: null }));

  // recurring_investments select chain
  const ruleSelect = {
    eq: vi.fn(() => ruleSelect),
    then: undefined as any, // not used
  };
  // We resolve the final eq() promise-style.
  const ruleQueryBuilder = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: opts.rules, error: null })),
      })),
    })),
  };

  const contribInsert = vi.fn((row: any) => {
    inserts.push(row);
    return Promise.resolve(insertImpl(row));
  });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "recurring_investments") return ruleQueryBuilder;
      if (table === "investment_contributions") {
        return { insert: contribInsert };
      }
      throw new Error("unexpected table " + table);
    }),
  } as any;

  return { supabase, inserts, contribInsert };
}

describe("matchTransactionToRecurringInvestments", () => {
  it("returns [] for positive (credit) amounts", async () => {
    const { supabase } = makeMockSupabase({ rules: [] });
    const out = await matchTransactionToRecurringInvestments({
      supabase,
      transactionId: "tx-1",
      description: "DIVIDEND PAYMENT",
      amountCents: 1500,
      partnershipId: "p-1",
      contributedAt: "2026-04-30T00:00:00Z",
    });
    expect(out).toEqual([]);
  });

  it("returns [] for empty description", async () => {
    const { supabase } = makeMockSupabase({ rules: [] });
    const out = await matchTransactionToRecurringInvestments({
      supabase,
      transactionId: "tx-1",
      description: "",
      amountCents: -10000,
      partnershipId: "p-1",
      contributedAt: "2026-04-30T00:00:00Z",
    });
    expect(out).toEqual([]);
  });

  it("matches a debit against a case-insensitive substring rule", async () => {
    const { supabase, inserts } = makeMockSupabase({
      rules: [
        {
          id: "rule-1",
          asset_id: "asset-1",
          amount_cents: 20000,
          merchant_pattern: "PEARLER",
        },
      ],
    });
    const out = await matchTransactionToRecurringInvestments({
      supabase,
      transactionId: "tx-42",
      description: "Pearler Pty Ltd",
      amountCents: -20000,
      partnershipId: "p-1",
      contributedAt: "2026-04-30T00:00:00Z",
    });
    expect(out).toEqual([
      { ruleId: "rule-1", assetId: "asset-1", amountCents: 20000 },
    ]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      investment_id: "asset-1",
      partnership_id: "p-1",
      amount_cents: 20000,
      rule_id: "rule-1",
      source_transaction_id: "tx-42",
    });
  });

  it("uses the actual debit amount (abs), not the rule amount", async () => {
    const { supabase, inserts } = makeMockSupabase({
      rules: [
        {
          id: "rule-1",
          asset_id: "asset-1",
          amount_cents: 20000, // expected $200
          merchant_pattern: "PEARLER",
        },
      ],
    });
    const out = await matchTransactionToRecurringInvestments({
      supabase,
      transactionId: "tx-99",
      description: "PEARLER ONE-OFF",
      amountCents: -55000, // user actually sent $550
      partnershipId: "p-1",
      contributedAt: "2026-04-30T00:00:00Z",
    });
    expect(out[0].amountCents).toBe(55000);
    expect(inserts[0].amount_cents).toBe(55000);
  });

  it("ignores non-matching rules", async () => {
    const { supabase, inserts } = makeMockSupabase({
      rules: [
        {
          id: "rule-1",
          asset_id: "asset-1",
          amount_cents: 20000,
          merchant_pattern: "PEARLER",
        },
        {
          id: "rule-2",
          asset_id: "asset-2",
          amount_cents: 10000,
          merchant_pattern: "VANGUARD",
        },
      ],
    });
    const out = await matchTransactionToRecurringInvestments({
      supabase,
      transactionId: "tx-1",
      description: "Pearler Pty Ltd",
      amountCents: -20000,
      partnershipId: "p-1",
      contributedAt: "2026-04-30T00:00:00Z",
    });
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe("rule-1");
    expect(inserts).toHaveLength(1);
  });

  it("swallows duplicate-key errors from re-fired webhooks", async () => {
    const { supabase, inserts } = makeMockSupabase({
      rules: [
        {
          id: "rule-1",
          asset_id: "asset-1",
          amount_cents: 20000,
          merchant_pattern: "PEARLER",
        },
      ],
      insertImpl: () => ({ error: { code: "23505", message: "duplicate key" } }),
    });
    const out = await matchTransactionToRecurringInvestments({
      supabase,
      transactionId: "tx-42",
      description: "Pearler Pty Ltd",
      amountCents: -20000,
      partnershipId: "p-1",
      contributedAt: "2026-04-30T00:00:00Z",
    });
    // Insert was attempted, but the unique-violation is treated as a no-op.
    expect(inserts).toHaveLength(1);
    expect(out).toEqual([]); // no MatchedRule pushed since insert "failed"
  });

  it("matches multiple rules if both substrings hit", async () => {
    const { supabase, inserts } = makeMockSupabase({
      rules: [
        {
          id: "rule-1",
          asset_id: "asset-1",
          amount_cents: 10000,
          merchant_pattern: "AUTO",
        },
        {
          id: "rule-2",
          asset_id: "asset-2",
          amount_cents: 10000,
          merchant_pattern: "INVEST",
        },
      ],
    });
    const out = await matchTransactionToRecurringInvestments({
      supabase,
      transactionId: "tx-1",
      description: "AUTO INVEST DEBIT",
      amountCents: -25000,
      partnershipId: "p-1",
      contributedAt: "2026-04-30T00:00:00Z",
    });
    expect(out).toHaveLength(2);
    expect(inserts).toHaveLength(2);
  });
});
