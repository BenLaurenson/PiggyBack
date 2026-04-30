/**
 * Feature flags for the hosted-tier launch.
 *
 * All flags read from `NEXT_PUBLIC_*` env vars so they're inlined at build
 * time and consistent between server and client renders.
 *
 * Default each flag's value to the SAFE state for production launch:
 *   - Features that are incomplete or being staged: default OFF.
 *   - Features that are stable: default ON.
 *
 * To enable a flag for a deployment, set the env var to "true" on the
 * Vercel project. Any other value (including blank) means OFF.
 */

function flag(name: string): boolean {
  return process.env[name] === "true";
}

/**
 * FIRE (Financial Independence, Retire Early) tracking.
 *
 * Hidden by default for v1 launch — the feature is incomplete (net worth
 * tracking, savings rate, projected FI date are all partial). Will return
 * post-30-days-stable. See /roadmap.
 */
export const isFireEnabled = (): boolean => flag("NEXT_PUBLIC_FIRE_ENABLED");

/**
 * Hosted-platform onboarding (the A$19/mo Stripe-gated flow).
 * Default OFF — only on the orchestrator (piggyback.finance + dev).
 */
export const isHostedEnabled = (): boolean => flag("NEXT_PUBLIC_HOSTED_ENABLED");
