import { describe, it, expect } from 'vitest';
import { matchCategorisationRule, type CategorisationRule } from '@/lib/business-categorise';

const rule = (over: Partial<CategorisationRule>): CategorisationRule => ({
  id: 'r1',
  match_field: 'description',
  match_type: 'contains',
  match_value: 'AWS',
  coa_id: 'coa-aws',
  coa_default_gst_code: 'G11',
  gst_code_override: null,
  priority: 100,
  is_active: true,
  ...over,
});

describe('matchCategorisationRule', () => {
  it('returns null when no rules match', () => {
    const result = matchCategorisationRule([rule({})], { description: 'Coffee', wise_category: null });
    expect(result).toBeNull();
  });

  it('returns the first matching rule by priority ASC', () => {
    const rules = [
      rule({ id: 'high', priority: 200, match_value: 'AWS' }),
      rule({ id: 'low', priority: 50, match_value: 'AWS' }),
    ];
    const result = matchCategorisationRule(rules, { description: 'AWS Sydney', wise_category: null });
    expect(result?.id).toBe('low');
  });

  it('ignores inactive rules', () => {
    const result = matchCategorisationRule(
      [rule({ is_active: false })],
      { description: 'AWS Sydney', wise_category: null },
    );
    expect(result).toBeNull();
  });

  it('matches case-insensitively', () => {
    const result = matchCategorisationRule(
      [rule({ match_value: 'aws' })],
      { description: 'AWS Sydney', wise_category: null },
    );
    expect(result?.id).toBe('r1');
  });

  it('exact matcher requires full-string equality', () => {
    const r = rule({ match_type: 'exact', match_value: 'AWS' });
    expect(matchCategorisationRule([r], { description: 'AWS Sydney', wise_category: null })).toBeNull();
    expect(matchCategorisationRule([r], { description: 'AWS', wise_category: null })?.id).toBe('r1');
  });

  it('starts_with matcher anchors at the beginning', () => {
    const r = rule({ match_type: 'starts_with', match_value: 'AWS' });
    expect(matchCategorisationRule([r], { description: 'AWS Sydney', wise_category: null })?.id).toBe('r1');
    expect(matchCategorisationRule([r], { description: 'Old AWS', wise_category: null })).toBeNull();
  });

  it('match_field=wise_category matches on the wise_category input', () => {
    const r = rule({ match_field: 'wise_category', match_value: 'utilities' });
    expect(matchCategorisationRule([r], { description: 'AGL', wise_category: 'utilities' })?.id).toBe('r1');
    expect(matchCategorisationRule([r], { description: 'AGL', wise_category: null })).toBeNull();
  });
});
