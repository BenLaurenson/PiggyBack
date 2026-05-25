import { describe, it, expect } from 'vitest';
import { computeGstAmountCents, isGstApplicable, type GstCode } from '@/lib/business-gst';

describe('isGstApplicable', () => {
  it('returns true for G1, G10, G11', () => {
    expect(isGstApplicable('G1')).toBe(true);
    expect(isGstApplicable('G10')).toBe(true);
    expect(isGstApplicable('G11')).toBe(true);
  });

  it('returns false for N-T and INP', () => {
    expect(isGstApplicable('N-T')).toBe(false);
    expect(isGstApplicable('INP')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isGstApplicable(null)).toBe(false);
  });
});

describe('computeGstAmountCents', () => {
  it('returns null when amount is null', () => {
    expect(computeGstAmountCents(null, 'G1')).toBeNull();
  });

  it('returns 0 for non-applicable codes', () => {
    expect(computeGstAmountCents(11_000, 'N-T')).toBe(0);
    expect(computeGstAmountCents(11_000, 'INP')).toBe(0);
    expect(computeGstAmountCents(11_000, null)).toBe(0);
  });

  it('divides positive amounts by 11 with round-half-to-even', () => {
    expect(computeGstAmountCents(11_000, 'G1')).toBe(1000);
    expect(computeGstAmountCents(10_000, 'G1')).toBe(909);
    expect(computeGstAmountCents(8_500, 'G11')).toBe(773);
  });

  it('preserves sign for negative debit amounts', () => {
    expect(computeGstAmountCents(-11_000, 'G11')).toBe(-1000);
    expect(computeGstAmountCents(-8_500, 'G11')).toBe(-773);
  });

  it('returns 0 for zero amount with applicable code', () => {
    expect(computeGstAmountCents(0, 'G1')).toBe(0);
  });

  it('rejects unsafe non-integer cents inputs', () => {
    expect(() => computeGstAmountCents(1.5 as unknown as number, 'G1')).toThrow();
  });
});
