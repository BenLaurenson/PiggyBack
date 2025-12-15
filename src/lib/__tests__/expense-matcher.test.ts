import { describe, it, expect } from 'vitest';
import * as ExpenseMatcher from '@/lib/expense-matcher';

/**
 * Tests for Issue 27 — Dead code removal: findBestMatchEnhanced
 *
 * The findBestMatchEnhanced function is an unused alias for findBestMatch.
 * It should be removed to reduce dead code.
 */

describe('expense-matcher exports — Issue 27', () => {
  it('should NOT export findBestMatchEnhanced (dead code removed)', () => {
    expect(
      (ExpenseMatcher as Record<string, unknown>).findBestMatchEnhanced
    ).toBeUndefined();
  });

  it('should still export findBestMatch', () => {
    expect(ExpenseMatcher.findBestMatch).toBeDefined();
    expect(typeof ExpenseMatcher.findBestMatch).toBe('function');
  });
});
