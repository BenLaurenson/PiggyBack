import { describe, it, expect } from "vitest";
import {
  findDefaultRuleForDescription,
  type MerchantDefaultRule,
} from "../merchant-default-rules";

/**
 * Tests the rule-application priority logic that the sync flow relies
 * on. The actual sync route is integration-tested via in-process
 * resolution: we verify that the resolution function picks the right
 * rule for a given description.
 */

const ALDI: MerchantDefaultRule = {
  id: "rule-aldi",
  merchant_pattern: "ALDI",
  category_id: "groceries",
  parent_category_id: "home",
  source: "curated",
  is_active: true,
};

const WOOLWORTHS: MerchantDefaultRule = {
  id: "rule-woolworths",
  merchant_pattern: "Woolworths",
  category_id: "groceries",
  parent_category_id: "home",
  source: "curated",
  is_active: true,
};

const NETFLIX: MerchantDefaultRule = {
  id: "rule-netflix",
  merchant_pattern: "Netflix",
  category_id: "tv-and-music",
  parent_category_id: "good-life",
  source: "curated",
  is_active: true,
};

describe("merchant rule application", () => {
  const byPattern = new Map([
    ["aldi", ALDI],
    ["woolworths", WOOLWORTHS],
    ["netflix", NETFLIX],
  ]);

  it("matches ALDI exactly (acceptance test seed)", () => {
    const rule = findDefaultRuleForDescription("ALDI", byPattern);
    expect(rule?.category_id).toBe("groceries");
    expect(rule?.parent_category_id).toBe("home");
  });

  it("matches noisy Up Bank-style descriptions", () => {
    expect(
      findDefaultRuleForDescription("Aldi Stores Bondi", byPattern)?.id
    ).toBe("rule-aldi");
    expect(
      findDefaultRuleForDescription("WOOLWORTHS 1234 Sydney", byPattern)?.id
    ).toBe("rule-woolworths");
    expect(
      findDefaultRuleForDescription("Netflix.com Subscription", byPattern)?.id
    ).toBe("rule-netflix");
  });

  it("simulates the admin -> sync flow: edit ALDI default, lookup", () => {
    // Admin edits ALDI - simulate by replacing the rule.
    const updated: MerchantDefaultRule = {
      ...ALDI,
      category_id: "takeaway",
      parent_category_id: "good-life",
    };
    const updatedMap = new Map([["aldi", updated]]);
    const found = findDefaultRuleForDescription("ALDI Marrickville", updatedMap);
    expect(found?.category_id).toBe("takeaway");
    expect(found?.parent_category_id).toBe("good-life");
  });

  it("returns null when description doesn't match any rule", () => {
    expect(
      findDefaultRuleForDescription("Some Random Cafe", byPattern)
    ).toBeNull();
  });
});
