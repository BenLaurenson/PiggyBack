/**
 * Resolve the orchestrator-side caller's `piggyback_provisions` row from
 * their authenticated Supabase session.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * The orchestrator authenticates users via Supabase Auth (Google OAuth).
 * Supabase exposes the Google `sub` claim under
 * `user.user_metadata.provider_id` for Google logins, and falls back to
 * `user.user_metadata.sub`. We use this `sub` to look up the canonical
 * `piggyback_provisions.google_sub` row — that row is the orchestrator-side
 * identity that owns partner_links / partner_claim_invitations records.
 */
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { assertOrchestrator } from "@/lib/role-context";

export interface CallerContext {
  userId: string; // auth.users.id
  email: string;
  googleSub: string;
  provisionId: string;
  displayName: string | null;
}

export type ResolveCallerResult =
  | { ok: true; caller: CallerContext }
  | { ok: false; status: 401 | 403; error: string };

export async function resolveOrchestratorCaller(): Promise<ResolveCallerResult> {
  assertOrchestrator("resolveOrchestratorCaller");
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, status: 401, error: "Not signed in." };
  }
  const user = userData.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  // Google OAuth populates `provider_id`; native Google sign-in uses `sub`;
  // identities[].provider_id covers both for safety.
  const providerSub =
    (meta.provider_id as string | undefined) ??
    (meta.sub as string | undefined) ??
    null;
  const identities = (user.identities ?? []) as Array<{
    provider: string;
    provider_id?: string | null;
    id?: string | null;
  }>;
  const googleIdentity = identities.find((i) => i.provider === "google");
  const googleSub =
    providerSub ??
    googleIdentity?.provider_id ??
    googleIdentity?.id ??
    null;
  if (!googleSub) {
    return {
      ok: false,
      status: 403,
      error: "Cannot determine Google sub for caller — sign in with Google.",
    };
  }
  const email = user.email?.toLowerCase() ?? null;
  if (!email) {
    return { ok: false, status: 403, error: "User has no email." };
  }
  const service = createServiceRoleClient();
  const { data: provision, error: provErr } = await service
    .from("piggyback_provisions")
    .select("id, google_sub, email, display_name")
    .eq("google_sub", googleSub)
    .maybeSingle();
  if (provErr) {
    console.error("[partners/auth] provision lookup failed", provErr);
    return { ok: false, status: 403, error: "Could not resolve provision." };
  }
  if (!provision) {
    return {
      ok: false,
      status: 403,
      error: "No PiggyBack provision for this account yet.",
    };
  }
  return {
    ok: true,
    caller: {
      userId: user.id,
      email,
      googleSub,
      provisionId: (provision as { id: string }).id,
      displayName: (provision as { display_name: string | null }).display_name,
    },
  };
}
