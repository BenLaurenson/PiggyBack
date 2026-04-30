/**
 * Vercel OAuth integration callback handler.
 *
 * Vercel integrations work slightly differently from a standard OAuth flow:
 * the user installs the integration, Vercel sends them to our `redirect_url`
 * with `?code=...&configurationId=...&teamId=...&next=...` (and `state` if we
 * passed one on the install URL).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeVercelAuthCode,
} from "@/lib/provisioner/vercel-api";
import {
  audit,
  getProvisionById,
  storeOAuthToken,
  transitionState,
} from "@/lib/provisioner/state-machine";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";
import { ANONYMOUS_ID_COOKIE } from "@/lib/analytics/anonymous-id";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://piggyback.finance";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const configurationId = url.searchParams.get("configurationId");
  const teamId = url.searchParams.get("teamId");
  const provisionId = url.searchParams.get("state");

  if (!code || !provisionId) {
    return NextResponse.redirect(`${appUrl()}/get-started?error=missing_code_or_state`);
  }

  const provision = await getProvisionById(provisionId);
  if (!provision) {
    return NextResponse.redirect(`${appUrl()}/get-started?error=invalid_state`);
  }

  const clientId = process.env.VERCEL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.VERCEL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl()}/get-started?error=oauth_not_configured`);
  }

  let exchanged;
  try {
    exchanged = await exchangeVercelAuthCode({
      code,
      redirectUri: `${appUrl()}/oauth/vercel/callback`,
      clientId,
      clientSecret,
    });
  } catch (err) {
    await audit(provisionId, "OAUTH_VERCEL_FAILED", { message: String(err) });
    return NextResponse.redirect(`${appUrl()}/get-started?error=vercel_token_exchange_failed`);
  }

  await storeOAuthToken({
    provisionId,
    provider: "vercel",
    accessToken: exchanged.access_token,
    externalConfigId: configurationId ?? undefined,
  });

  // Persist team_id directly on the provision for later API calls.
  if (teamId) {
    const supabase = createServiceRoleClient();
    await supabase
      .from("piggyback_provisions")
      .update({ vercel_team_id: teamId })
      .eq("id", provisionId);
  }

  await transitionState(provisionId, "VERCEL_AUTHED", "Vercel integration authorized");

  // Phase 4 funnel: vercel_oauth_completed fires only after the auth-code
  // exchange + token storage succeeds. Tokens are NEVER included in the
  // event payload. team_id and configuration_id are opaque IDs returned in
  // query params from Vercel's redirect — they are not secrets, but we
  // still avoid logging the access_token/scope from the exchanged response.
  const anonymousId = request.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null;
  void track(FunnelEvent.VERCEL_OAUTH_COMPLETED, {
    anonymousId,
    properties: {
      provision_id: provisionId,
      team_id: teamId ?? null,
      configuration_id: configurationId ?? null,
    },
  });

  return NextResponse.redirect(`${appUrl()}/get-started?step=provision`);
}
