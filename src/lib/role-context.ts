/**
 * Runtime check distinguishing orchestrator (piggyback.finance) from tenant
 * ({shortid}.piggyback.finance) deploys. Orchestrator never holds transaction
 * data; tenant never holds Stripe / cross-user OAuth tokens.
 *
 * The signal is `NEXT_PUBLIC_HOSTED_ENABLED=true`, set on the orchestrator
 * Vercel project only. Per spec
 * `docs/superpowers/specs/2026-05-01-01-data-architecture-design.md`.
 */
export function isOrchestrator(): boolean {
  return process.env.NEXT_PUBLIC_HOSTED_ENABLED === "true";
}

export function isTenant(): boolean {
  return !isOrchestrator();
}

export function assertOrchestrator(label = "this code path"): void {
  if (!isOrchestrator()) {
    throw new Error(
      `${label} is orchestrator-only but NEXT_PUBLIC_HOSTED_ENABLED is not 'true'. Refusing to run on a tenant deploy.`
    );
  }
}

export function assertTenant(label = "this code path"): void {
  if (!isTenant()) {
    throw new Error(
      `${label} is tenant-only but NEXT_PUBLIC_HOSTED_ENABLED='true'. Refusing to run on the orchestrator.`
    );
  }
}
