"use client";

/**
 * Real-partner configuration card for /settings/partner.
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * Renders three subsections, gated on current state:
 *   1. Active link → consent toggles + sever button
 *   2. Pending invitation(s) issued by the caller → cancel buttons
 *   3. No link, no pending → invite-by-email form
 *
 * The component is self-contained: it fetches `/api/partners/state` on mount
 * and on every action that mutates state, and POSTs to the relevant
 * /api/partners/* endpoints. It is intentionally NOT styled with the brand
 * tokens of the existing manual-partner UI — it lives below that section as
 * a separate card.
 */
import { useCallback, useEffect, useState } from "react";

interface PartnerLink {
  partner_link_id: string;
  status: "active" | "severed" | "rejected" | "pending";
  role: "initiator" | "acceptor";
  partner_provision_id: string;
  partner_display_name: string | null;
  partner_email: string;
  active_at: string | null;
  consent_aggregate_view: boolean;
  consent_transaction_view: boolean;
}

interface PendingInvitation {
  id: string;
  invitee_email: string;
  manual_partner_name: string | null;
  expires_at: string;
}

interface PartnerState {
  link: PartnerLink | null;
  pending_invitations: PendingInvitation[];
}

interface PartnerConfigProps {
  /**
   * The caller's local partnership id (passed from the server-rendered
   * settings page that loaded it from this tenant's partnership_members).
   */
  localPartnershipId: string;
  /**
   * Optional initial state — server-rendered settings page can fetch this
   * up-front and pass it in to avoid a flash of "Loading…".
   */
  initialState?: PartnerState;
}

export function PartnerConfig({
  localPartnershipId,
  initialState,
}: PartnerConfigProps) {
  const [state, setState] = useState<PartnerState | null>(initialState ?? null);
  const [loading, setLoading] = useState(!initialState);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/partners/state", { cache: "no-store" });
      if (!r.ok) {
        setError(`Could not load partner state (${r.status}).`);
        return;
      }
      const json = (await r.json()) as PartnerState;
      setState(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialState) void refresh();
  }, [initialState, refresh]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/partners/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnership_id: localPartnershipId,
          invitee_email: inviteEmail.trim(),
          manual_partner_name: inviteName.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Invite failed (${r.status})`);
        return;
      }
      setInviteEmail("");
      setInviteName("");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(invitationId: string) {
    setError(null);
    const r = await fetch("/api/partners/cancel", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_id: invitationId }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Could not cancel invitation");
      return;
    }
    await refresh();
  }

  async function handleSever(partnerLinkId: string) {
    if (!confirm("Remove this partner? Both of you keep your own data.")) return;
    setError(null);
    const r = await fetch("/api/partners/sever", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner_link_id: partnerLinkId }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Could not sever partnership");
      return;
    }
    await refresh();
  }

  async function handleConsentToggle(
    partnerLinkId: string,
    field: "consent_aggregate_view" | "consent_transaction_view",
    value: boolean
  ) {
    setError(null);
    const r = await fetch("/api/partners/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner_link_id: partnerLinkId,
        [field]: value,
      }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Could not update consent");
      return;
    }
    await refresh();
  }

  if (loading && !state) {
    return (
      <div className="rounded-2xl border-2 border-border-white-80 bg-surface-white-60 p-4">
        Loading partner state…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-error-border bg-error-light p-3 text-error-text"
        >
          {error}
        </div>
      )}

      {state?.link?.status === "active" && (
        <ActiveLinkCard
          link={state.link}
          onSever={() => handleSever(state.link!.partner_link_id)}
          onConsentToggle={(field, value) =>
            handleConsentToggle(state.link!.partner_link_id, field, value)
          }
        />
      )}

      {state && state.pending_invitations.length > 0 && (
        <PendingInvitationsCard
          invitations={state.pending_invitations}
          onCancel={handleCancel}
        />
      )}

      {state && !state.link && state.pending_invitations.length === 0 && (
        <InviteFormCard
          email={inviteEmail}
          name={inviteName}
          submitting={submitting}
          onChangeEmail={setInviteEmail}
          onChangeName={setInviteName}
          onSubmit={handleInvite}
        />
      )}
    </div>
  );
}

function ActiveLinkCard(props: {
  link: PartnerLink;
  onSever: () => void;
  onConsentToggle: (
    field: "consent_aggregate_view" | "consent_transaction_view",
    value: boolean
  ) => void;
}) {
  const name =
    props.link.partner_display_name?.trim() || props.link.partner_email;
  return (
    <div className="space-y-3 rounded-2xl border-2 border-accent-teal-border bg-accent-teal-light p-4">
      <p className="font-bold">Partnered with {name}.</p>
      <p className="text-sm text-text-secondary">
        Linked since{" "}
        {props.link.active_at
          ? new Date(props.link.active_at).toLocaleDateString()
          : "—"}
      </p>
      <div className="space-y-2 pt-2">
        <ConsentRow
          label="Share my income & expense totals"
          description="Your partner sees your monthly income, expense, and split percentages."
          checked={props.link.consent_aggregate_view}
          onChange={(v) => props.onConsentToggle("consent_aggregate_view", v)}
        />
        <ConsentRow
          label="Share individual transactions"
          description="Your partner sees descriptions, amounts, and categories of your transactions. Off by default."
          checked={props.link.consent_transaction_view}
          onChange={(v) => props.onConsentToggle("consent_transaction_view", v)}
        />
      </div>
      <button
        type="button"
        onClick={props.onSever}
        className="rounded-xl border-2 border-error-border px-4 py-2 font-bold text-error-text hover:bg-error-light"
      >
        Remove partner
      </button>
    </div>
  );
}

function ConsentRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block font-bold">{props.label}</span>
        <span className="block text-sm text-text-secondary">{props.description}</span>
      </span>
    </label>
  );
}

function PendingInvitationsCard(props: {
  invitations: PendingInvitation[];
  onCancel: (id: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border-2 border-warning-border bg-warning-light p-4">
      <p className="font-bold">Pending invitations</p>
      <ul className="space-y-2">
        {props.invitations.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between rounded-xl bg-surface-white-60 p-3"
          >
            <div>
              <p className="font-bold">
                {inv.manual_partner_name?.trim() || inv.invitee_email}
              </p>
              <p className="text-sm text-text-secondary">
                {inv.invitee_email} — expires{" "}
                {new Date(inv.expires_at).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => props.onCancel(inv.id)}
              className="rounded-xl border-2 border-text-secondary px-3 py-1 font-bold"
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InviteFormCard(props: {
  email: string;
  name: string;
  submitting: boolean;
  onChangeEmail: (v: string) => void;
  onChangeName: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={props.onSubmit}
      className="space-y-3 rounded-2xl border-2 border-border-white-80 bg-surface-white-60 p-4"
    >
      <p className="font-bold">Invite a real partner</p>
      <p className="text-sm text-text-secondary">
        We&apos;ll send them an email with a link to accept. They&apos;ll get
        their own PiggyBack and you&apos;ll see each other&apos;s monthly totals.
      </p>
      <div className="space-y-2">
        <label className="block">
          <span className="block font-bold">Their email</span>
          <input
            type="email"
            required
            placeholder="sarah@example.com"
            value={props.email}
            onChange={(e) => props.onChangeEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block font-bold">Their first name (optional)</span>
          <input
            type="text"
            placeholder="Sarah"
            value={props.name}
            onChange={(e) => props.onChangeName(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 px-3 py-2"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={props.submitting || !props.email.trim()}
        className="rounded-xl bg-brand-coral px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        {props.submitting ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}
