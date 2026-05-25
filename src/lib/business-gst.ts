export type GstCode = 'G1' | 'G10' | 'G11' | 'N-T' | 'INP';

const GST_APPLICABLE: ReadonlySet<GstCode> = new Set(['G1', 'G10', 'G11']);

export function isGstApplicable(code: GstCode | null): boolean {
  if (code === null) return false;
  return GST_APPLICABLE.has(code);
}

export function computeGstAmountCents(
  amountAudCents: number | null,
  gstCode: GstCode | null,
): number | null {
  if (amountAudCents === null) return null;
  if (!Number.isInteger(amountAudCents)) {
    throw new Error(
      `computeGstAmountCents: amountAudCents must be an integer (cents), got ${amountAudCents}`,
    );
  }
  if (!isGstApplicable(gstCode)) return 0;

  const sign = Math.sign(amountAudCents);
  const magnitude = Math.round(Math.abs(amountAudCents) / 11);
  return sign * magnitude;
}
