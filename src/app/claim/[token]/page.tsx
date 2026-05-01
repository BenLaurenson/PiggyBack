/**
 * Partner-claim landing page.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * Server-rendered. Looks up the invitation by token using the service-role
 * client, renders an explanatory state ("expired", "already used", "ready to
 * accept"), and hands off to a client component for the Accept / Decline
 * action which POSTs to /api/partners/claim or /api/partners/reject.
 *
 * Sign-in handling: if the user is signed in already we say "Hey {name},
 * accept Ben's invite?" and let them act. Otherwise we point them at the
 * sign-in flow with a return URL so they land back here after auth.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { ClaimActions } from "@/components/claim/claim-actions";

export const dynamic = "force-dynamic";

interface InvitationLookup {
  id: string;
  invitee_email: string;
  invited_by_provision_id: string;
  invited_by_partnership_id: string | null;
  manual_partner_name: string | null;
  expires_at: string;
  claimed_at: string | null;
  rejected_at: string | null;
}

interface InviterInfo {
  display_name: string | null;
  email: string;
}

async function fetchInvitation(token: string): Promise<{
  invitation: InvitationLookup | null;
  inviter: InviterInfo | null;
}> {
  const supabase = createServiceRoleClient();
  const { data: invitationRow } = await supabase
    .from("partner_claim_invitations")
    .select(
      "id, invitee_email, invited_by_provision_id, invited_by_partnership_id, manual_partner_name, expires_at, claimed_at, rejected_at"
    )
    .eq("token", token)
    .maybeSingle();
  if (!invitationRow) {
    return { invitation: null, inviter: null };
  }
  const invitation = invitationRow as InvitationLookup;
  const { data: inviterRow } = await supabase
    .from("piggyback_provisions")
    .select("display_name, email")
    .eq("id", invitation.invited_by_provision_id)
    .maybeSingle();
  return {
    invitation,
    inviter: (inviterRow as InviterInfo | null) ?? null,
  };
}

export default async function ClaimPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  if (!token || token.length > 100) notFound();

  const { invitation, inviter } = await fetchInvitation(token);
  if (!invitation || !inviter) {
    return (
      <ClaimShell title="Invitation not found">
        <p>This claim link doesn&apos;t match any invitation. Either it was cancelled or the URL is wrong.</p>
        <p>
          <Link className="underline" href="/">
            Back to PiggyBack
          </Link>
        </p>
      </ClaimShell>
    );
  }

  const inviterName = inviter.display_name ?? inviter.email;
  const greetingName = invitation.manual_partner_name?.trim();
  const greeting = greetingName ? `Hey ${greetingName},` : "Hey,";

  if (invitation.claimed_at) {
    return (
      <ClaimShell title="Invitation already used">
        <p>{greeting}</p>
        <p>This invitation has already been accepted. If that wasn&apos;t you, ask {inviterName} to send a new one.</p>
      </ClaimShell>
    );
  }
  if (invitation.rejected_at) {
    return (
      <ClaimShell title="Invitation declined">
        <p>{greeting}</p>
        <p>This invitation was declined. Ask {inviterName} for a fresh one if you&apos;ve changed your mind.</p>
      </ClaimShell>
    );
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return (
      <ClaimShell title="Invitation expired">
        <p>{greeting}</p>
        <p>This invitation has expired (links last 7 days). Ask {inviterName} to send a new one.</p>
      </ClaimShell>
    );
  }

  // Look at current orchestrator session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sessionEmail = user?.email?.toLowerCase() ?? null;
  const inviteEmail = invitation.invitee_email.toLowerCase();
  const signedInWithMatchingEmail =
    !!sessionEmail && sessionEmail === inviteEmail;
  const signedInWithDifferentEmail =
    !!sessionEmail && sessionEmail !== inviteEmail;

  return (
    <ClaimShell title={`${inviterName} invited you to share their PiggyBack budget`}>
      <p>{greeting}</p>
      <p>
        {inviterName} invited you to link up on PiggyBack — split bills, see joint income vs expenses, and track shared
        goals together. The invitation was sent to <strong>{invitation.invitee_email}</strong>.
      </p>

      {signedInWithMatchingEmail && (
        <ClaimActions token={token} mode="accept-or-decline" inviterName={inviterName} />
      )}

      {signedInWithDifferentEmail && (
        <div className="mt-6 rounded-xl border-2 border-warning-border bg-warning-light p-4">
          <p className="font-bold">You&apos;re signed in as {sessionEmail}.</p>
          <p>
            This invitation was sent to {invitation.invitee_email}. Sign out and back in with that email, or ask {inviterName}{" "}
            to re-send to the right address.
          </p>
          <form action="/api/auth/signout" method="post" className="mt-3">
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </div>
      )}

      {!user && (
        <div className="mt-6 rounded-xl border-2 border-info-border bg-info-light p-4">
          <p className="font-bold">Sign in or sign up to accept</p>
          <p>
            Use <strong>{invitation.invitee_email}</strong> when you sign up — that&apos;s the address {inviterName} used.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/claim/${token}`)}`}
            className="mt-3 inline-block rounded-xl bg-brand-coral px-4 py-2 font-bold text-white"
          >
            Sign in / sign up
          </Link>
          <ClaimActions token={token} mode="decline-only" inviterName={inviterName} />
        </div>
      )}
    </ClaimShell>
  );
}

function ClaimShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
