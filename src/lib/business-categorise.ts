import type { GstCode } from '@/lib/business-gst';

export type MatchField = 'description' | 'wise_category';
export type MatchType = 'contains' | 'exact' | 'starts_with';

export interface CategorisationRule {
  id: string;
  match_field: MatchField;
  match_type: MatchType;
  match_value: string;
  coa_id: string;
  /**
   * The matched COA's `default_gst_code`, pre-joined at fetch time.
   * Keeps `processWiseTransaction` free of DB lookups inside the
   * ingestion hot path — callers join chart_of_accounts once when
   * loading the rule set.
   */
  coa_default_gst_code: GstCode;
  gst_code_override: GstCode | null;
  priority: number;
  is_active: boolean;
}

export interface CategorisationInput {
  description: string;
  wise_category: string | null;
}

function matches(rule: CategorisationRule, haystack: string | null): boolean {
  if (haystack === null) return false;
  const h = haystack.toLowerCase();
  const n = rule.match_value.toLowerCase();
  switch (rule.match_type) {
    case 'contains':
      return h.includes(n);
    case 'exact':
      return h === n;
    case 'starts_with':
      return h.startsWith(n);
  }
}

/**
 * Returns the first matching rule in priority ASC order (lowest priority
 * number wins), or null if no rule matches. Inactive rules are skipped.
 */
export function matchCategorisationRule(
  rules: readonly CategorisationRule[],
  input: CategorisationInput,
): CategorisationRule | null {
  const ordered = [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    const haystack = rule.match_field === 'description' ? input.description : input.wise_category;
    if (matches(rule, haystack)) return rule;
  }
  return null;
}
