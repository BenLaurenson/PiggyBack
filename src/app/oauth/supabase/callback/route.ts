/**
 * Supabase OAuth callback handler.
 *
 * Flow:
 *   1. User clicks "Connect Supabase" on /get-started.
 *   2. We redirect to Supabase's OAuth consent screen with
 *      ?response_type=code&client_id=...&redirect_uri=...&state=<provision_id>.
 *   3. User clicks Authorize. Supabase redirects back here with ?code=...&state=...
 *   4. We exchange the code for an access + refresh token.
 *   5. We encrypt + store both, then transition the provision to SUPABASE_AUTHED.
 *   6. Redirect to /get-started which now shows the next step.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeSupabaseAuthCode,
} from "@/lib/provisioner/supabase-mgmt";
import {
  audit,
  getProvisionById,
  storeOAuthToken,
  transitionState,
} from "@/lib/provisioner/state-machine";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://piggyback.finance";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const provisionId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${appUrl()}/get-started?error=${encodeURIComponent(error)}`
    );
  }
  if (!code || !provisionId) {
    return NextResponse.redirect(`${appUrl()}/get-started?error=missing_code_or_state`);
  }

  const provision = await getProvisionById(provisionId);
  if (!provision) {
    return NextResponse.redirect(`${appUrl()}/get-started?error=invalid_state`);
  }

  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl()}/get-started?error=oauth_not_configured`);
  }

  let exchanged;
  try {
    exchanged = await exchangeSupabaseAuthCode({
      code,
      redirectUri: `${appUrl()}/oauth/supabase/callback`,
      clientId,
      clientSecret,
    });
  } catch (err) {
    await audit(provisionId, "OAUTH_SUPABASE_FAILED", { message: String(err) });
    return NextResponse.redirect(`${appUrl()}/get-started?error=token_exchange_failed`);
  }

  await storeOAuthToken({
    provisionId,
    provider: "supabase",
    accessToken: exchanged.access_token,
    refreshToken: exchanged.refresh_token,
    expiresInSeconds: exchanged.expires_in,
  });

  await transitionState(provisionId, "SUPABASE_AUTHED", "Supabase OAuth authorized");

  return NextResponse.redirect(`${appUrl()}/get-started?step=vercel`);
}
