import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

describe("merchant-default-rules", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("findDefaultRuleForDescription", () => {
    it("returns the exact match when present", async () => {
      const { findDefaultRuleForDescription } = await import(
        "../merchant-default-rules"
      );
      const rule = {
        id: "r1",
        merchant_pattern: "ALDI",
        category_id: "groceries",
        parent_category_id: "home",
        source: "curated" as const,
        is_active: true,
      };
      const byPattern = new Map([["aldi", rule]]);
      const result = findDefaultRuleForDescription("ALDI", byPattern);
      expect(result).toEqual(rule);
    });

    it("matches case-insensitively", async () => {
      const { findDefaultRuleForDescription } = await import(
        "../merchant-default-rules"
      );
      const rule = {
        id: "r1",
        merchant_pattern: "Coles",
        category_id: "groceries",
        parent_category_id: "home",
        source: "curated" as const,
        is_active: true,
      };
      const byPattern = new Map([["coles", rule]]);
      expect(findDefaultRuleForDescription("COLES", byPattern)).toEqual(rule);
      expect(findDefaultRuleForDescription("coles", byPattern)).toEqual(rule);
    });

    it("falls back to substring match for noisy descriptions", async () => {
      const { findDefaultRuleForDescription } = await import(
        "../merchant-default-rules"
      );
      const rule = {
        id: "r1",
        merchant_pattern: "Woolworths",
        category_id: "groceries",
        parent_category_id: "home",
        source: "curated" as const,
        is_active: true,
      };
      const byPattern = new Map([["woolworths", rule]]);
      const desc = "Woolworths 1234 Sydney NSW";
      expect(findDefaultRuleForDescription(desc, byPattern)).toEqual(rule);
    });

    it("prefers the longest substring match", async () => {
      const { findDefaultRuleForDescription } = await import(
        "../merchant-default-rules"
      );
      const shortRule = {
        id: "r1",
        merchant_pattern: "Big",
        category_id: "shopping",
        parent_category_id: null as string | null,
        source: "curated" as const,
        is_active: true,
      };
      const longRule = {
        id: "r2",
        merchant_pattern: "Big W Kids",
        category_id: "family",
        parent_category_id: "personal" as string | null,
        source: "curated" as const,
        is_active: true,
      };
      const byPattern = new Map([
        ["big", shortRule],
        ["big w kids", longRule],
      ]);
      const desc = "Big W Kids Department";
      expect(findDefaultRuleForDescription(desc, byPattern)).toEqual(longRule);
    });

    it("returns null when no pattern matches", async () => {
      const { findDefaultRuleForDescription } = await import(
        "../merchant-default-rules"
      );
      const byPattern = new Map();
      expect(
        findDefaultRuleForDescription("Random Merchant", byPattern)
      ).toBeNull();
    });

    it("returns null for empty descriptions", async () => {
      const { findDefaultRuleForDescription } = await import(
        "../merchant-default-rules"
      );
      const byPattern = new Map();
      expect(findDefaultRuleForDescription("", byPattern)).toBeNull();
    });
  });

  describe("loadMerchantDefaultRules", () => {
    it("queries only active rules and indexes by lowercase pattern", async () => {
      const rows = [
        {
          id: "r1",
          merchant_pattern: "ALDI",
          category_id: "groceries",
          parent_category_id: "home",
          source: "curated",
          is_active: true,
        },
      ];
      const mockEq = vi.fn().mockResolvedValue({ data: rows, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      const { createServiceRoleClient } = await import(
        "@/utils/supabase/service-role"
      );
      (createServiceRoleClient as any).mockReturnValue({ from: mockFrom });

      const {
        loadMerchantDefaultRules,
        invalidateMerchantDefaultRulesCache,
      } = await import("../merchant-default-rules");
      invalidateMerchantDefaultRulesCache();

      const result = await loadMerchantDefaultRules();

      expect(mockFrom).toHaveBeenCalledWith("merchant_default_rules");
      expect(mockEq).toHaveBeenCalledWith("is_active", true);
      expect(result.byPattern.has("aldi")).toBe(true);
      expect(result.byPattern.get("aldi")?.id).toBe("r1");
    });

    it("returns empty without caching on DB error", async () => {
      const mockEq = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { message: "fail" } })
        .mockResolvedValueOnce({
          data: [
            {
              id: "r1",
              merchant_pattern: "ALDI",
              category_id: "groceries",
              parent_category_id: "home",
              source: "curated",
              is_active: true,
            },
          ],
          error: null,
        });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      const { createServiceRoleClient } = await import(
        "@/utils/supabase/service-role"
      );
      (createServiceRoleClient as any).mockReturnValue({ from: mockFrom });

      const {
        loadMerchantDefaultRules,
        invalidateMerchantDefaultRulesCache,
      } = await import("../merchant-default-rules");
      invalidateMerchantDefaultRulesCache();

      const first = await loadMerchantDefaultRules();
      expect(first.rules).toHaveLength(0);

      // On a subsequent call (no cache), should re-query and succeed.
      const second = await loadMerchantDefaultRules();
      expect(second.rules).toHaveLength(1);
    });
  });
});
