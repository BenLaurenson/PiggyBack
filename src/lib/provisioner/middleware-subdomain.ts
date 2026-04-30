/**
 * Phase 3.2 — 301-redirect helper for retired subdomains.
 *
 * Runs at the very top of the orchestrator's middleware. For requests whose
 * host matches `<x>.piggyback.finance` (NOT the orchestrator apex / www and
 * NOT a tenant's *current* subdomain), look the host up against the
 * subdomain_aliases table; if it's still inside its grace window, return the
 * URL the request should redirect to. Otherwise return null so middleware
 * proceeds normally.
 *
 * Skipped when:
 *   - The hosted-platform feature flag is off (NEXT_PUBLIC_HOSTED_ENABLED !== 'true')
 *     OR the orchestrator-only env vars aren't set. This keeps tenant deploys
 *     and self-hosters from doing pointless work / failing on a missing table.
 *
 * Pure logic split out into `pickAliasRedirectTarget` so it tests cleanly
 * without the Next request object.
 */

import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// NOTE: We intentionally do NOT import from `./subdomain.ts` here. That module
// re-exports `generateShortId` (which uses Node's `crypto.randomBytes`) and
// Turbopack's edge-runtime checker walks the import graph statically — it
// flags any chain that touches `crypto`, even when tree-shaking would drop
// the unused export at runtime. So we duplicate the tiny `isAliasActive`
// helper inline; the canonical version lives in `./subdomain.ts` and the
// `subdomain.test.ts` suite covers it.
const APEX = "piggyback.finance";

function isAliasActive(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() > now.getTime();
}

/**
 * Pure helper used by both middleware and tests.
 *
 * Given a hostname and a (possibly null) alias row, decide whether to
 * redirect, and to where.
 */
export function pickAliasRedirectTarget(input: {
  hostname: string;
  pathAndQuery: string;
  alias: {
    expires_at: string;
    /** The provision's current subdomain (vanity if set, otherwise shortid). */
    current_subdomain: string | null;
  } | null;
  now?: Date;
}): string | null {
  if (!input.alias) return null;
  if (!input.alias.current_subdomain) return null;

  const expiresAt = new Date(input.alias.expires_at);
  if (Number.isNaN(expiresAt.getTime())) return null;
  if (!isAliasActive(expiresAt, input.now)) return null;

  // Don't redirect if (somehow) the host is already the active subdomain.
  if (input.hostname === `${input.alias.current_subdomain}.${APEX}`) return null;

  const target = `https://${input.alias.current_subdomain}.${APEX}${input.pathAndQuery}`;
  return target;
}

/**
 * Look up the host against subdomain_aliases and return the redirect URL if
 * the alias is still active. Null otherwise.
 */
export async function resolveSubdomainAliasRedirect(
  request: NextRequest
): Promise<string | null> {
  // Cheap gate: only run on the orchestrator deploy. Without these env vars
  // we either don't have access to the orchestrator's Supabase or aren't
  // routing piggyback.finance subdomains at all.
  if (process.env.NEXT_PUBLIC_HOSTED_ENABLED !== "true") return null;

  const host = request.headers.get("host");
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();

  // We only care about `<x>.piggyback.finance` requests. The apex and `www`
  // are the marketing site itself.
  if (!hostname.endsWith(`.${APEX}`)) return null;
  if (hostname === APEX || hostname === `www.${APEX}`) return null;

  const label = hostname.slice(0, -1 - APEX.length); // strip ".piggyback.finance"
  // Sanity: label must look like a DNS subdomain. (Reject multi-segment
  // hostnames like `staging.app.piggyback.finance` if any sneak through.)
  if (label.includes(".")) return null;

  const supabase = createServiceRoleClient();
  const { data: alias } = await supabase
    .from("subdomain_aliases")
    .select("provision_id, expires_at")
    .eq("alias", label)
    .maybeSingle();
  if (!alias) return null;

  const { data: provision } = await supabase
    .from("piggyback_provisions")
    .select("subdomain_short_id, subdomain_vanity")
    .eq("id", alias.provision_id)
    .maybeSingle();

  const currentSubdomain = provision?.subdomain_vanity ?? provision?.subdomain_short_id ?? null;

  return pickAliasRedirectTarget({
    hostname,
    pathAndQuery: request.nextUrl.pathname + request.nextUrl.search,
    alias: { expires_at: alias.expires_at, current_subdomain: currentSubdomain },
  });
}
