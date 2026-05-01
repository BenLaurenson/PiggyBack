/**
 * Daily cron — for each CANCELLED provision past its 14-day grace period,
 * detach the custom domain from the user's Vercel project. We do NOT delete
 * the user's Supabase project or Vercel project — they keep their data and
 * infra. This is the "non-destructive cancellation" promised in the spec.
 *
 * After detaching, send the user an email confirming the transition to
 * self-managed mode.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { audit } from "@/lib/provisioner/state-machine";
import { removeProjectDomain, type VercelAuth } from "@/lib/provisioner/vercel-api";
import { decryptVaultToken } from "@/lib/provisioner/token-vault";
import { assertOrchestrator } from "@/lib/role-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const PIGGYBACK_DOMAIN = process.env.HOSTED_DOMAIN ?? "piggyback.finance";

async function getVercelAuth(provisionId: string, teamId: string | null): Promise<VercelAuth | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("provision_oauth_tokens")
    .select("encrypted_access_token")
    .eq("provision_id", provisionId)
    .eq("provider", "vercel")
    .maybeSingle();
  if (!data) return null;
  return {
    accessToken: decryptVaultToken(data.encrypted_access_token),
    teamId: teamId ?? undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    assertOrchestrator("release-cancelled-provisions");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Pick CANCELLED rows whose subdomain_teardown_at is <= now AND
  // whose state_data.domain_released is NOT true.
  const { data: pickups, error } = await supabase
    .from("piggyback_provisions")
    .select(
      "id, vercel_project_id, vercel_team_id, subdomain_short_id, subdomain_teardown_at, state_data, email, display_name"
    )
    .eq("state", "CANCELLED")
    .or(`subdomain_teardown_at.is.null,subdomain_teardown_at.lte.${cutoff}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const p of pickups ?? []) {
    const stateData = (p.state_data as Record<string, unknown> | null) ?? {};
    if (stateData.domain_released === true) {
      results.push({ id: p.id, skipped: "already_released" });
      continue;
    }
    if (!p.vercel_project_id || !p.subdomain_short_id) {
      results.push({ id: p.id, skipped: "no_vercel_or_subdomain" });
      continue;
    }
    const auth = await getVercelAuth(p.id, p.vercel_team_id ?? null);
    if (!auth) {
      results.push({ id: p.id, skipped: "no_vercel_token" });
      continue;
    }

    const domain = `${p.subdomain_short_id}.${PIGGYBACK_DOMAIN}`;
    try {
      await removeProjectDomain(auth, p.vercel_project_id, domain);
      await supabase
        .from("piggyback_provisions")
        .update({
          state_data: { ...stateData, domain_released: true, domain_released_at: new Date().toISOString() },
        })
        .eq("id", p.id);
      await audit(p.id, "DOMAIN_RELEASED", { domain });

      // Send the "you're now self-managed" email. Best-effort.
      if (p.email) {
        try {
          const { sendEmail } = await import("@/lib/email");
          await sendEmail({
            to: p.email,
            subject: "Your hosted PiggyBack is now self-managed",
            html: `
              <p>Hi ${p.display_name ?? "there"},</p>
              <p>Your <strong>piggyback.finance</strong> subscription was cancelled and the 14-day grace period has elapsed.</p>
              <p>Your data and infrastructure are intact in your own Supabase + Vercel accounts. You can re-attach a custom domain yourself, or keep using your <code>*.vercel.app</code> URL.</p>
              <p>If you'd like to come back, just re-subscribe at <a href="https://${PIGGYBACK_DOMAIN}">piggyback.finance</a>.</p>
              <p>Thanks for trying PiggyBack!</p>
            `,
            text: `Your hosted PiggyBack is now self-managed. Your data and infra are intact in your own Supabase + Vercel accounts. Re-subscribe anytime at https://${PIGGYBACK_DOMAIN}.`,
          });
          await audit(p.id, "TEARDOWN_EMAIL_SENT");
        } catch (emailErr) {
          await audit(p.id, "TEARDOWN_EMAIL_FAILED", { message: String(emailErr) });
        }
      }
      results.push({ id: p.id, ok: true, domain });
    } catch (err) {
      results.push({ id: p.id, error: String(err) });
      await audit(p.id, "DOMAIN_RELEASE_FAILED", { domain, message: String(err) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
