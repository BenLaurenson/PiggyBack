/**
 * Role context helper.
 *
 * NOTE: This is a minimal stub created for Plan #4 (Sync State Machine).
 * Plan #1 (Data Architecture) replaces this file with a richer
 * implementation. If both plans land at integration time, prefer the
 * Plan #1 version — it should remain backwards compatible with these
 * two helpers.
 */

export function isOrchestrator(): boolean {
  return process.env.NEXT_PUBLIC_HOSTED_ENABLED !== "true";
}

export function isTenant(): boolean {
  return process.env.NEXT_PUBLIC_HOSTED_ENABLED === "true";
}
