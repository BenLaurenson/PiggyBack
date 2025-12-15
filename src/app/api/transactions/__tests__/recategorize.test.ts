import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase server client
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Valid UUIDs that pass Zod v4 strict UUID validation (version 4, variant 1)
const TXN_1 = "a0000000-0000-4000-a000-000000000001";
const ACC_1 = "a0000000-0000-4000-a000-000000000010";
const OVERRIDE_1 = "a0000000-0000-4000-a000-000000000020";
const USER_123 = "a0000000-0000-4000-a000-000000000123";

describe("recategorize route", () => {
  let mockSupabase: any;

  // Helper to build chainable Supabase mock
  function createChain(resolvedValue: any = { data: null, error: null }) {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      upsert: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve(resolvedValue)),
      single: vi.fn(() => Promise.resolve(resolvedValue)),
    };
    return chain;
  }

  // Track calls by table name
  let tableChains: Record<string, any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    tableChains = {};

    mockSupabase = {
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: USER_123 } },
          })
        ),
      },
      from: vi.fn((table: string) => {
        if (!tableChains[table]) {
          tableChains[table] = createChain();
        }
        return tableChains[table];
      }),
    };

    const { createClient } = await import("@/utils/supabase/server");
    (createClient as any).mockResolvedValue(mockSupabase);
  });

  function createRequest(
    transactionId: string,
    body: Record<string, any>,
    method = "PATCH"
  ): Request {
    return new Request(
      `http://localhost:3000/api/transactions/${transactionId}/recategorize`,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  }

  describe("single transaction recategorize", () => {
    it("should create override and update transaction", async () => {
      // categories lookup
      tableChains["categories"] = createChain({
        data: { parent_category_id: "good-life" },
        error: null,
      });

      // transaction lookup
      tableChains["transactions"] = createChain({
        data: {
          id: TXN_1,
          category_id: "restaurants-and-cafes",
          parent_category_id: "good-life",
          account_id: ACC_1,
          description: "Test Merchant",
        },
        error: null,
      });

      // account ownership
      tableChains["accounts"] = createChain({
        data: { id: ACC_1, user_id: USER_123 },
        error: null,
      });

      // no existing override
      tableChains["transaction_category_overrides"] = createChain({
        data: null,
        error: null,
      });

      // category mapping
      tableChains["category_mappings"] = createChain({
        data: { new_parent_name: "Food & Dining", new_child_name: "Groceries", icon: "🛒" },
        error: null,
      });

      const { PATCH } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = createRequest(TXN_1, {
        category_id: "groceries",
        apply_to_merchant: false,
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.merchant_rule_created).toBe(false);
      expect(json.bulk_updated_count).toBe(0);

      // Verify override was inserted
      expect(tableChains["transaction_category_overrides"].insert).toHaveBeenCalled();
    });

    it("should return 401 when not authenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const { PATCH } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = createRequest(TXN_1, { category_id: "groceries" });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 when user does not own the transaction", async () => {
      tableChains["categories"] = createChain({
        data: { parent_category_id: "home" },
        error: null,
      });

      tableChains["transactions"] = createChain({
        data: { id: TXN_1, category_id: "groceries", parent_category_id: "home", account_id: ACC_1, description: "Test" },
        error: null,
      });

      // Different user owns the account
      tableChains["accounts"] = createChain({
        data: { id: ACC_1, user_id: "other-user" },
        error: null,
      });

      const { PATCH } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = createRequest(TXN_1, { category_id: "groceries" });
      const response = await PATCH(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("merchant rule creation", () => {
    it("should create merchant rule and bulk update when apply_to_merchant is true", async () => {
      tableChains["categories"] = createChain({
        data: { parent_category_id: "home" },
        error: null,
      });

      tableChains["transactions"] = createChain({
        data: {
          id: TXN_1,
          category_id: "restaurants-and-cafes",
          parent_category_id: "good-life",
          account_id: ACC_1,
          description: "Coffee Shop",
        },
        error: null,
      });

      tableChains["accounts"] = createChain({
        data: { id: ACC_1, user_id: USER_123 },
        error: null,
      });

      tableChains["transaction_category_overrides"] = createChain({
        data: null,
        error: null,
      });

      tableChains["merchant_category_rules"] = createChain({
        data: null,
        error: null,
      });

      tableChains["category_mappings"] = createChain({
        data: { new_parent_name: "Food & Dining", new_child_name: "Groceries", icon: "🛒" },
        error: null,
      });

      const { PATCH } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = createRequest(TXN_1, {
        category_id: "groceries",
        apply_to_merchant: true,
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.merchant_rule_created).toBe(true);

      // Verify merchant_category_rules.upsert was called
      expect(tableChains["merchant_category_rules"].upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_123,
          merchant_description: "Coffee Shop",
          category_id: "groceries",
        }),
        expect.objectContaining({ onConflict: "user_id,merchant_description" })
      );
    });

    it("should not create merchant rule when apply_to_merchant is false", async () => {
      tableChains["categories"] = createChain({
        data: { parent_category_id: "home" },
        error: null,
      });

      tableChains["transactions"] = createChain({
        data: {
          id: TXN_1,
          category_id: "restaurants-and-cafes",
          parent_category_id: "good-life",
          account_id: ACC_1,
          description: "Coffee Shop",
        },
        error: null,
      });

      tableChains["accounts"] = createChain({
        data: { id: ACC_1, user_id: USER_123 },
        error: null,
      });

      tableChains["transaction_category_overrides"] = createChain({
        data: null,
        error: null,
      });

      tableChains["category_mappings"] = createChain({
        data: { new_parent_name: "Food & Dining", new_child_name: "Groceries", icon: "🛒" },
        error: null,
      });

      const { PATCH } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = createRequest(TXN_1, {
        category_id: "groceries",
        apply_to_merchant: false,
      });

      await PATCH(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });

      // merchant_category_rules should not have been accessed
      expect(tableChains["merchant_category_rules"]).toBeUndefined();
    });

    it("should not create merchant rule when category_id is null (remove category)", async () => {
      tableChains["categories"] = createChain({ data: null, error: null });

      tableChains["transactions"] = createChain({
        data: {
          id: TXN_1,
          category_id: "groceries",
          parent_category_id: "home",
          account_id: ACC_1,
          description: "Coffee Shop",
        },
        error: null,
      });

      tableChains["accounts"] = createChain({
        data: { id: ACC_1, user_id: USER_123 },
        error: null,
      });

      tableChains["transaction_category_overrides"] = createChain({
        data: null,
        error: null,
      });

      tableChains["category_mappings"] = createChain({
        data: null,
        error: null,
      });

      const { PATCH } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = createRequest(TXN_1, {
        category_id: null,
        apply_to_merchant: true,
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.merchant_rule_created).toBe(false);
      expect(json.bulk_updated_count).toBe(0);
    });
  });

  describe("update existing override", () => {
    it("should update existing override instead of creating a new one", async () => {
      tableChains["categories"] = createChain({
        data: { parent_category_id: "home" },
        error: null,
      });

      tableChains["transactions"] = createChain({
        data: {
          id: TXN_1,
          category_id: "groceries",
          parent_category_id: "home",
          account_id: ACC_1,
          description: "Test",
        },
        error: null,
      });

      tableChains["accounts"] = createChain({
        data: { id: ACC_1, user_id: USER_123 },
        error: null,
      });

      // Existing override
      tableChains["transaction_category_overrides"] = createChain({
        data: {
          id: OVERRIDE_1,
          transaction_id: TXN_1,
          original_category_id: "restaurants-and-cafes",
          notes: "old note",
        },
        error: null,
      });

      tableChains["category_mappings"] = createChain({
        data: { new_parent_name: "Food & Dining", new_child_name: "Booze", icon: "🍺" },
        error: null,
      });

      const { PATCH } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = createRequest(TXN_1, {
        category_id: "booze",
        apply_to_merchant: false,
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.override_created).toBe(false);

      // Should update, not insert
      expect(tableChains["transaction_category_overrides"].update).toHaveBeenCalled();
    });
  });

  describe("DELETE — reset to original", () => {
    it("should restore original categories and delete override", async () => {
      tableChains["transaction_category_overrides"] = createChain({
        data: {
          id: OVERRIDE_1,
          transaction_id: TXN_1,
          original_category_id: "restaurants-and-cafes",
          original_parent_category_id: "good-life",
          changed_by: USER_123,
        },
        error: null,
      });

      tableChains["transactions"] = createChain({
        data: { id: TXN_1 },
        error: null,
      });

      const { DELETE } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = new Request(
        `http://localhost:3000/api/transactions/${TXN_1}/recategorize`,
        { method: "DELETE" }
      );

      const response = await DELETE(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.reset_to_original).toBe(true);

      // Verify transaction was updated with original values
      expect(tableChains["transactions"].update).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: "restaurants-and-cafes",
          parent_category_id: "good-life",
        })
      );

      // Verify override was deleted
      expect(tableChains["transaction_category_overrides"].delete).toHaveBeenCalled();
    });

    it("should return 403 when user does not own the override", async () => {
      tableChains["transaction_category_overrides"] = createChain({
        data: {
          id: OVERRIDE_1,
          transaction_id: TXN_1,
          changed_by: "other-user",
        },
        error: null,
      });

      const { DELETE } = await import(
        "@/app/api/transactions/[id]/recategorize/route"
      );

      const request = new Request(
        `http://localhost:3000/api/transactions/${TXN_1}/recategorize`,
        { method: "DELETE" }
      );

      const response = await DELETE(request, {
        params: Promise.resolve({ id: TXN_1 }),
      });

      expect(response.status).toBe(403);
    });
  });
});
