import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// Mock all dependencies before importing the route
vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/match-expense-transactions", () => ({
  matchSingleTransactionToExpenses: vi.fn(),
  matchSingleTransactionToIncomeSources: vi.fn(),
}));

vi.mock("@/lib/infer-category", () => ({
  inferCategoryId: vi.fn(() => "test-category"),
  ensureInferredCategories: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/ai-categorize", () => ({
  aiCategorizeTransaction: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/token-encryption", () => ({
  getPlaintextToken: vi.fn((token: string) => token),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Helper to create a valid webhook payload
function createWebhookPayload(
  eventType: string,
  webhookId = "webhook-123",
  transactionId = "txn-123"
) {
  return {
    data: {
      type: "webhook-events",
      id: "event-123",
      attributes: {
        eventType,
        createdAt: new Date().toISOString(),
      },
      relationships: {
        webhook: {
          data: { type: "webhooks", id: webhookId },
        },
        transaction: {
          data: { type: "transactions", id: transactionId },
        },
      },
    },
  };
}

// Helper to sign a payload
function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// Helper to create a Request object
function createRequest(
  body: string,
  signature: string | null = null
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature) {
    headers.set("X-Up-Authenticity-Signature", signature);
  }
  return new Request("http://localhost:3000/api/upbank/webhook", {
    method: "POST",
    headers,
    body,
  });
}

describe("webhook route", () => {
  const WEBHOOK_SECRET = "test-webhook-secret";
  const ENCRYPTED_TOKEN = "test-token";

  // Mock Supabase chain
  let mockSupabase: any;
  let mockFrom: any;
  let mockSelect: any;
  let mockEq: any;
  let mockMaybeSingle: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Reset global fetch mock
    vi.stubGlobal("fetch", vi.fn());

    // Setup Supabase mock chain
    mockMaybeSingle = vi.fn();
    const mockLimit = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
    mockEq = vi.fn(() => ({ eq: mockEq, limit: mockLimit, maybeSingle: mockMaybeSingle }));
    mockSelect = vi.fn(() => ({ eq: mockEq }));
    mockFrom = vi.fn(() => ({ select: mockSelect, upsert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => ({ data: { id: "saved-txn-123" }, error: null })) })) })) }));
    mockSupabase = { from: mockFrom };

    const { createServiceRoleClient } = await import(
      "@/utils/supabase/service-role"
    );
    (createServiceRoleClient as any).mockReturnValue(mockSupabase);
  });

  describe("Issue 2 — Error responses", () => {
    it("should return 500 on handler error, not 200", async () => {
      // First call to maybeSingle returns config (for signature verification)
      // Then make subsequent Supabase calls throw to simulate DB failure
      let callCount = 0;
      mockMaybeSingle.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            data: {
              webhook_secret: WEBHOOK_SECRET,
              encrypted_token: ENCRYPTED_TOKEN,
              user_id: "user-123",
            },
            error: null,
          });
        }
        throw new Error("Database connection lost");
      });

      // Mock fetch to return a transaction successfully
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            type: "transactions",
            id: "txn-123",
            attributes: {
              status: "SETTLED",
              description: "Test",
              rawText: null,
              message: null,
              isCategorizable: true,
              holdInfo: null,
              roundUp: null,
              cashback: null,
              amount: { currencyCode: "AUD", value: "-10.00", valueInBaseUnits: -1000 },
              foreignAmount: null,
              cardPurchaseMethod: null,
              settledAt: "2026-01-01T00:00:00Z",
              createdAt: new Date().toISOString(),
            },
            relationships: {
              account: { data: { type: "accounts", id: "acc-123" } },
              transferAccount: { data: null },
              category: { data: null },
              parentCategory: { data: null },
              tags: { data: [] },
            },
          },
        }),
      });

      // Make supabase.from() throw after the config lookup
      const origFrom = mockFrom;
      let fromCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        fromCallCount++;
        if (table === "up_api_configs") {
          return { select: mockSelect };
        }
        // Throw on accounts lookup to cause processTransaction to fail
        throw new Error("Database connection lost");
      });

      const payload = createWebhookPayload("TRANSACTION_CREATED");
      const body = JSON.stringify(payload);
      const signature = signPayload(body, WEBHOOK_SECRET);

      const { POST } = await import(
        "@/app/api/upbank/webhook/route"
      );
      const response = await POST(createRequest(body, signature));

      // Should return 500, NOT 200
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).not.toBe(true);
    });

    it("should return 200 on successful processing", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          webhook_secret: WEBHOOK_SECRET,
          encrypted_token: ENCRYPTED_TOKEN,
          user_id: "user-123",
        },
        error: null,
      });

      const payload = createWebhookPayload("PING");
      const body = JSON.stringify(payload);
      const signature = signPayload(body, WEBHOOK_SECRET);

      const { POST } = await import(
        "@/app/api/upbank/webhook/route"
      );
      const response = await POST(createRequest(body, signature));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it("should return 400 for invalid JSON", async () => {
      const { POST } = await import(
        "@/app/api/upbank/webhook/route"
      );
      const response = await POST(createRequest("not json"));

      expect(response.status).toBe(400);
    });

    it("should return 401 when webhook not found", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const payload = createWebhookPayload("PING");
      const body = JSON.stringify(payload);

      const { POST } = await import(
        "@/app/api/upbank/webhook/route"
      );
      const response = await POST(createRequest(body, "invalid-sig"));

      expect(response.status).toBe(401);
    });

    it("should return 401 for invalid signature", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          webhook_secret: WEBHOOK_SECRET,
          encrypted_token: ENCRYPTED_TOKEN,
          user_id: "user-123",
        },
        error: null,
      });

      const payload = createWebhookPayload("PING");
      const body = JSON.stringify(payload);

      const { POST } = await import(
        "@/app/api/upbank/webhook/route"
      );
      const response = await POST(createRequest(body, "wrong-signature"));

      expect(response.status).toBe(401);
    });
  });

  describe("Issue 21 — Malformed hex signature handling", () => {
    it("should return 401 for malformed hex signature (odd length)", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          webhook_secret: WEBHOOK_SECRET,
          encrypted_token: ENCRYPTED_TOKEN,
          user_id: "user-123",
        },
        error: null,
      });

      const payload = createWebhookPayload("PING");
      const body = JSON.stringify(payload);

      // Odd-length hex string - will produce wrong-length buffer
      const malformedSignature = "abc";

      const { POST } = await import("@/app/api/upbank/webhook/route");
      const response = await POST(createRequest(body, malformedSignature));

      // Should return 401 (not throw/500)
      expect(response.status).toBe(401);
    });

    it("should return 401 for non-hex characters in signature", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          webhook_secret: WEBHOOK_SECRET,
          encrypted_token: ENCRYPTED_TOKEN,
          user_id: "user-123",
        },
        error: null,
      });

      const payload = createWebhookPayload("PING");
      const body = JSON.stringify(payload);

      // Contains non-hex characters (zz, xx, etc.)
      const malformedSignature = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

      const { POST } = await import("@/app/api/upbank/webhook/route");
      const response = await POST(createRequest(body, malformedSignature));

      expect(response.status).toBe(401);
    });

    it("should return 401 for empty string signature", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          webhook_secret: WEBHOOK_SECRET,
          encrypted_token: ENCRYPTED_TOKEN,
          user_id: "user-123",
        },
        error: null,
      });

      const payload = createWebhookPayload("PING");
      const body = JSON.stringify(payload);

      const { POST } = await import("@/app/api/upbank/webhook/route");
      // Empty string signature
      const response = await POST(createRequest(body, ""));

      expect(response.status).toBe(401);
    });
  });

  describe("Issue 4 — TRANSACTION_DELETED handling", () => {
    it("should soft-delete transaction when TRANSACTION_DELETED event received", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          webhook_secret: WEBHOOK_SECRET,
          encrypted_token: ENCRYPTED_TOKEN,
          user_id: "user-123",
        },
        error: null,
      });

      // Setup mock for soft delete operations
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ data: null, error: null })),
        })),
      }));
      const mockDelete = vi.fn(() => ({
        eq: vi.fn(() => ({ data: null, error: null })),
      }));

      // Override from to handle different table queries
      mockFrom.mockImplementation((table: string) => {
        if (table === "accounts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ id: "local-acc-1" }],
                error: null,
              })),
            })),
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({
                    data: { id: "txn-123" },
                    error: null,
                  })),
                })),
              })),
            })),
            update: mockUpdate,
          };
        }
        if (table === "expense_matches") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ id: "match-1", expense_definition_id: "exp-1" }],
                error: null,
              })),
            })),
            delete: mockDelete,
          };
        }
        // For up_api_configs (signature verification)
        return { select: mockSelect };
      });

      const payload = createWebhookPayload("TRANSACTION_DELETED");
      const body = JSON.stringify(payload);
      const signature = signPayload(body, WEBHOOK_SECRET);

      const { POST } = await import(
        "@/app/api/upbank/webhook/route"
      );
      const response = await POST(createRequest(body, signature));

      expect(response.status).toBe(200);

      // Verify that the transaction table was updated (soft delete)
      expect(mockFrom).toHaveBeenCalledWith("transactions");
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should return 200 even when the deleted transaction is not found locally", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          webhook_secret: WEBHOOK_SECRET,
          encrypted_token: ENCRYPTED_TOKEN,
          user_id: "user-123",
        },
        error: null,
      });

      // Override from to return no transaction for the delete lookup
      const originalFrom = mockFrom;
      mockFrom.mockImplementation((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => ({
                  data: null,
                  error: null,
                })),
              })),
            })),
          };
        }
        // For up_api_configs lookup
        return { select: mockSelect };
      });

      const payload = createWebhookPayload("TRANSACTION_DELETED");
      const body = JSON.stringify(payload);
      const signature = signPayload(body, WEBHOOK_SECRET);

      const { POST } = await import(
        "@/app/api/upbank/webhook/route"
      );
      const response = await POST(createRequest(body, signature));

      // Should still succeed — missing local txn is not an error
      expect(response.status).toBe(200);
    });
  });

  describe("Goal sync via webhook", () => {
    it("should update linked savings goal when saver account balance changes", async () => {
      mockMaybeSingle.mockImplementation(() => {
        return Promise.resolve({
          data: {
            webhook_secret: WEBHOOK_SECRET,
            encrypted_token: ENCRYPTED_TOKEN,
            user_id: "user-123",
          },
          error: null,
        });
      });

      // Mock fetch: transaction + account balance
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/transactions/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                type: "transactions",
                id: "txn-saver-1",
                attributes: {
                  status: "SETTLED",
                  description: "Transfer to Savings",
                  rawText: null,
                  message: null,
                  isCategorizable: true,
                  holdInfo: null,
                  roundUp: null,
                  cashback: null,
                  amount: { currencyCode: "AUD", value: "500.00", valueInBaseUnits: 50000 },
                  foreignAmount: null,
                  cardPurchaseMethod: null,
                  settledAt: "2026-01-15T00:00:00Z",
                  createdAt: "2026-01-15T00:00:00Z",
                },
                relationships: {
                  account: { data: { type: "accounts", id: "up-saver-1" } },
                  transferAccount: { data: null },
                  category: { data: null },
                  parentCategory: { data: null },
                  tags: { data: [] },
                },
              },
            }),
          });
        }
        if (url.includes("/accounts/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                type: "accounts",
                id: "up-saver-1",
                attributes: {
                  displayName: "Holiday Saver",
                  accountType: "SAVER",
                  ownershipType: "INDIVIDUAL",
                  balance: { currencyCode: "AUD", value: "1500.00", valueInBaseUnits: 150000 },
                },
              },
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      // Track goal update calls
      const mockGoalUpdateEq = vi.fn(() => ({ error: null }));
      const mockGoalUpdate = vi.fn(() => ({ eq: mockGoalUpdateEq }));

      mockFrom.mockImplementation((table: string) => {
        if (table === "up_api_configs") {
          return { select: mockSelect };
        }
        if (table === "accounts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => {
                // For up_account_id query (goal sync + balance update)
                if (col === "up_account_id") {
                  return {
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(() => Promise.resolve({
                        data: { id: "local-saver-1", ownership_type: "INDIVIDUAL" },
                        error: null,
                      })),
                    })),
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(() => Promise.resolve({
                        data: { id: "local-saver-1", ownership_type: "INDIVIDUAL" },
                        error: null,
                      })),
                    })),
                    data: [{ id: "local-saver-1" }],
                    error: null,
                  };
                }
                return {
                  maybeSingle: vi.fn(() => Promise.resolve({
                    data: { id: "local-saver-1", ownership_type: "INDIVIDUAL" },
                    error: null,
                  })),
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => Promise.resolve({
                      data: { id: "local-saver-1", ownership_type: "INDIVIDUAL" },
                      error: null,
                    })),
                  })),
                };
              }),
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  data: [{
                    id: "local-saver-1",
                    display_name: "Savings",
                    account_type: "SAVER",
                    balance_cents: 150000,
                    ownership_type: "INDIVIDUAL",
                    up_account_id: "up-saver-1",
                    user_id: "user-123",
                  }],
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
          };
        }
        if (table === "investments") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          };
        }
        if (table === "savings_goals") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  data: [{
                    id: "goal-1",
                    current_amount_cents: 100000,
                    target_amount_cents: 200000,
                  }],
                  error: null,
                })),
              })),
            })),
            update: mockGoalUpdate,
          };
        }
        if (table === "partnership_members") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({
                  data: { partnership_id: "partnership-1" },
                  error: null,
                })),
                data: [{ user_id: "user-123" }],
                error: null,
              })),
            })),
          };
        }
        if (table === "net_worth_snapshots") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn(() => ({ error: null })),
          };
        }
        if (table === "goal_contributions") {
          return {
            insert: vi.fn(() => ({ error: null })),
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
            upsert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { id: "saved-txn-saver-1" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "merchant_category_rules") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
          upsert: vi.fn(() => ({ error: null })),
        };
      });

      const payload = createWebhookPayload("TRANSACTION_SETTLED", "webhook-123", "txn-saver-1");
      const body = JSON.stringify(payload);
      const signature = signPayload(body, WEBHOOK_SECRET);

      const { POST } = await import("@/app/api/upbank/webhook/route");
      const response = await POST(createRequest(body, signature));

      expect(response.status).toBe(200);

      // Verify savings_goals table was accessed
      expect(mockFrom).toHaveBeenCalledWith("savings_goals");
      // Verify the goal update was called
      expect(mockGoalUpdate).toHaveBeenCalled();
    });
  });

  describe("Net worth snapshot via webhook", () => {
    it("should upsert net worth snapshot when account balance changes", async () => {
      mockMaybeSingle.mockImplementation(() => {
        return Promise.resolve({
          data: {
            webhook_secret: WEBHOOK_SECRET,
            encrypted_token: ENCRYPTED_TOKEN,
            user_id: "user-123",
          },
          error: null,
        });
      });

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes("/transactions/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                type: "transactions",
                id: "txn-123",
                attributes: {
                  status: "SETTLED",
                  description: "Coffee",
                  rawText: null,
                  message: null,
                  isCategorizable: true,
                  holdInfo: null,
                  roundUp: null,
                  cashback: null,
                  amount: { currencyCode: "AUD", value: "-5.00", valueInBaseUnits: -500 },
                  foreignAmount: null,
                  cardPurchaseMethod: null,
                  settledAt: "2026-01-15T00:00:00Z",
                  createdAt: "2026-01-15T00:00:00Z",
                },
                relationships: {
                  account: { data: { type: "accounts", id: "up-acc-1" } },
                  transferAccount: { data: null },
                  category: { data: null },
                  parentCategory: { data: null },
                  tags: { data: [] },
                },
              },
            }),
          });
        }
        if (url.includes("/accounts/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                type: "accounts",
                id: "up-acc-1",
                attributes: {
                  displayName: "Spending",
                  accountType: "TRANSACTIONAL",
                  ownershipType: "INDIVIDUAL",
                  balance: { currencyCode: "AUD", value: "1000.00", valueInBaseUnits: 100000 },
                },
              },
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const mockSnapshotInsert = vi.fn(() => ({ error: null }));

      mockFrom.mockImplementation((table: string) => {
        if (table === "up_api_configs") {
          return { select: mockSelect };
        }
        if (table === "accounts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({
                    data: { id: "local-acc-1", ownership_type: "INDIVIDUAL" },
                    error: null,
                  })),
                })),
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({
                    data: { id: "local-acc-1", ownership_type: "INDIVIDUAL" },
                    error: null,
                  })),
                  data: [{ id: "local-acc-1" }],
                  error: null,
                })),
                data: [{ id: "local-acc-1" }],
                error: null,
              })),
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  data: [{
                    id: "local-acc-1",
                    display_name: "Spending",
                    account_type: "TRANSACTIONAL",
                    balance_cents: 100000,
                    ownership_type: "INDIVIDUAL",
                    up_account_id: "up-acc-1",
                    user_id: "user-123",
                  }],
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
          };
        }
        if (table === "savings_goals") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === "investments") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          };
        }
        if (table === "partnership_members") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({
                  data: { partnership_id: "partnership-1" },
                  error: null,
                })),
                data: [{ user_id: "user-123" }],
                error: null,
              })),
            })),
          };
        }
        if (table === "net_worth_snapshots") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
            upsert: mockSnapshotInsert,
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
            upsert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { id: "saved-txn-1" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "merchant_category_rules") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
          upsert: vi.fn(() => ({ error: null })),
        };
      });

      const payload = createWebhookPayload("TRANSACTION_SETTLED");
      const body = JSON.stringify(payload);
      const signature = signPayload(body, WEBHOOK_SECRET);

      const { POST } = await import("@/app/api/upbank/webhook/route");
      const response = await POST(createRequest(body, signature));

      expect(response.status).toBe(200);

      // Verify net_worth_snapshots table was accessed
      expect(mockFrom).toHaveBeenCalledWith("net_worth_snapshots");
      expect(mockSnapshotInsert).toHaveBeenCalled();
    });
  });

  describe("Issue 36 — HOME_LOAN account type support", () => {
    it("should process a transaction from a HOME_LOAN account without errors", async () => {
      // Config lookup returns valid config
      mockMaybeSingle.mockImplementation(() => {
        return Promise.resolve({
          data: {
            webhook_secret: WEBHOOK_SECRET,
            encrypted_token: ENCRYPTED_TOKEN,
            user_id: "user-123",
          },
          error: null,
        });
      });

      // Mock fetch to return: 1) transaction data, 2) HOME_LOAN account for balance update
      let fetchCallCount = 0;
      (global.fetch as any).mockImplementation((url: string) => {
        fetchCallCount++;
        // Transaction fetch
        if (url.includes("/transactions/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  type: "transactions",
                  id: "txn-homeloan-1",
                  attributes: {
                    status: "SETTLED",
                    description: "Home Loan Repayment",
                    rawText: null,
                    message: null,
                    isCategorizable: true,
                    holdInfo: null,
                    roundUp: null,
                    cashback: null,
                    amount: {
                      currencyCode: "AUD",
                      value: "-2500.00",
                      valueInBaseUnits: -250000,
                    },
                    foreignAmount: null,
                    cardPurchaseMethod: null,
                    settledAt: "2026-01-15T00:00:00Z",
                    createdAt: "2026-01-15T00:00:00Z",
                  },
                  relationships: {
                    account: {
                      data: { type: "accounts", id: "acc-homeloan-1" },
                    },
                    transferAccount: { data: null },
                    category: { data: null },
                    parentCategory: { data: null },
                    tags: { data: [] },
                  },
                },
              }),
          });
        }
        // Account fetch — returns HOME_LOAN type
        if (url.includes("/accounts/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  type: "accounts",
                  id: "acc-homeloan-1",
                  attributes: {
                    displayName: "Home Loan",
                    accountType: "HOME_LOAN",
                    ownershipType: "INDIVIDUAL",
                    balance: {
                      currencyCode: "AUD",
                      value: "-450000.00",
                      valueInBaseUnits: -45000000,
                    },
                  },
                },
              }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      // Setup supabase mock for full processing
      const mockUpdateEq = vi.fn(() => ({ error: null }));
      const mockUpdateFn = vi.fn(() => ({ eq: mockUpdateEq }));
      mockFrom.mockImplementation((table: string) => {
        if (table === "up_api_configs") {
          return { select: mockSelect };
        }
        if (table === "accounts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: { id: "local-acc-1", ownership_type: "INDIVIDUAL" },
                      error: null,
                    })
                  ),
                })),
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: { id: "local-acc-1", ownership_type: "INDIVIDUAL" },
                      error: null,
                    })
                  ),
                })),
              })),
            })),
            update: mockUpdateFn,
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: null, error: null })
                  ),
                })),
              })),
            })),
            upsert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: "saved-txn-homeloan-1" },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        if (table === "merchant_category_rules") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: null, error: null })
                  ),
                })),
              })),
            })),
          };
        }
        // Default for tags, expense_matches etc.
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: null, error: null })
              ),
            })),
          })),
          upsert: vi.fn(() => ({ error: null })),
          insert: vi.fn(() => ({ error: null })),
        };
      });

      const payload = createWebhookPayload(
        "TRANSACTION_SETTLED",
        "webhook-123",
        "txn-homeloan-1"
      );
      const body = JSON.stringify(payload);
      const signature = signPayload(body, WEBHOOK_SECRET);

      const { POST } = await import("@/app/api/upbank/webhook/route");
      const response = await POST(createRequest(body, signature));

      // The webhook should process successfully (return 200)
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });
  });
});
