"use client";

/**
 * Client-side accept/decline buttons for /claim/[token].
 *
 * Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
 *
 * Two modes:
 *   - "accept-or-decline": signed-in user with matching email; render both
 *     buttons.
 *   - "decline-only": user not signed in or signed in as different account;
 *     render only the decline button (signing in is handled by the parent
 *     server component via a /login link).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

interface ClaimActionsProps {
  token: string;
  mode: "accept-or-decline" | "decline-only";
  inviterName: string;
}

export function ClaimActions({ token, mode, inviterName }: ClaimActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<null | "accept" | "decline">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "accepted" | "declined">(null);

  async function accept() {
    setError(null);
    setLoading("accept");
    try {
      const r = await fetch("/api/partners/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not accept (${r.status})`);
      } else {
        setDone("accepted");
        // Pause briefly to flash the success state, then send the user home.
        setTimeout(() => router.push("/home"), 800);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  async function decline() {
    setError(null);
    setLoading("decline");
    try {
      const r = await fetch("/api/partners/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not decline (${r.status})`);
      } else {
        setDone("declined");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  if (done === "accepted") {
    return (
      <div className="mt-6 rounded-xl border-2 border-accent-teal-border bg-accent-teal-light p-4">
        <p className="font-bold">You&apos;re partnered with {inviterName}.</p>
        <p>Heading to your home dashboard…</p>
      </div>
    );
  }
  if (done === "declined") {
    return (
      <div className="mt-6 rounded-xl border-2 border-info-border bg-info-light p-4">
        <p className="font-bold">Invitation declined.</p>
        <p>{inviterName} won&apos;t see your data.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-2">
      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-error-border bg-error-light p-3 text-error-text"
        >
          {error}
        </div>
      )}
      <div className="flex gap-2">
        {mode === "accept-or-decline" && (
          <button
            type="button"
            onClick={accept}
            disabled={!!loading}
            className="rounded-xl bg-brand-coral px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {loading === "accept" ? "Accepting…" : "Accept invitation"}
          </button>
        )}
        <button
          type="button"
          onClick={decline}
          disabled={!!loading}
          className="rounded-xl border-2 border-text-secondary px-4 py-2 font-bold text-text-primary disabled:opacity-50"
        >
          {loading === "decline" ? "Declining…" : "Decline"}
        </button>
      </div>
    </div>
  );
}
