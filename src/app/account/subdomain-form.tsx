"use client";

/**
 * Phase 3.2 — Vanity rename UI on /account.
 *
 * Live regex/reserved-list validation, 30-day cooldown awareness, and a
 * progress message when the rename is in flight (Vercel domain attach +
 * orchestrator alias attach can take a few seconds).
 */

import { useState, useTransition } from "react";
import { Loader2, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateVanityName } from "@/lib/provisioner/subdomain";

interface Props {
  shortId: string | null;
  vanity: string | null;
  cooldownMessage: string | null;
  aliases: Array<{ alias: string; expires_at: string; kind: string }>;
}

export function SubdomainForm({ shortId, vanity, cooldownMessage, aliases }: Props) {
  const active = vanity ?? shortId;
  const [name, setName] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  const trimmed = name.trim().toLowerCase();
  const live = trimmed === "" ? { ok: true as const } : validateVanityName(trimmed);
  const disabled =
    !!cooldownMessage || isSaving || trimmed === "" || !live.ok || trimmed === vanity;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    setSuccess(null);
    startSave(async () => {
      const r = await fetch("/api/account/subdomain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vanity: trimmed }),
      });
      const data: { ok?: boolean; error?: string; activeSubdomain?: string } = await r.json();
      if (!r.ok || !data.ok) {
        setServerError(data.error ?? `Couldn't save (${r.status})`);
        return;
      }
      setSuccess(
        data.activeSubdomain
          ? `Saved. Your PiggyBack is now at ${data.activeSubdomain}.piggyback.finance.`
          : "Saved."
      );
      setName("");
      // Soft refresh so the page re-fetches the new state.
      window.setTimeout(() => window.location.reload(), 1500);
    });
  }

  return (
    <div className="rounded-3xl bg-white border border-border-light p-6 md:p-8 mb-6 space-y-4">
      <div>
        <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider text-text-tertiary mb-2">
          Custom subdomain
        </p>
        <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mb-4">
          Pick a name you&apos;ll remember. 3–32 lowercase letters, digits, and hyphens.
          Old subdomain keeps redirecting for 30 days after a rename.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              placeholder={vanity ?? "your-name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-border-medium font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-coral/40"
              disabled={!!cooldownMessage || isSaving}
            />
            <span className="self-center font-mono text-sm text-text-tertiary">
              .piggyback.finance
            </span>
          </div>

          {!live.ok && trimmed !== "" && (
            <p className="text-sm text-amber-700 font-[family-name:var(--font-dm-sans)]">
              {live.reason}
            </p>
          )}
          {cooldownMessage && (
            <p className="text-sm text-text-tertiary font-[family-name:var(--font-dm-sans)]">
              {cooldownMessage}
            </p>
          )}
          {serverError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 font-[family-name:var(--font-dm-sans)]">
              {serverError}
            </div>
          )}
          {success && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-[family-name:var(--font-dm-sans)] flex items-center gap-2">
              <Check className="w-4 h-4" />
              {success}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={disabled}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {vanity ? "Rename subdomain" : "Set custom subdomain"}
            </Button>
            {active && (
              <a
                href={`https://${active}.piggyback.finance`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-coral inline-flex items-center gap-1 hover:underline font-[family-name:var(--font-dm-sans)]"
              >
                Currently: {active}.piggyback.finance
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </form>
      </div>

      {aliases.length > 0 && (
        <>
          <hr className="border-border-light" />
          <div>
            <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider text-text-tertiary mb-2">
              Old subdomains (redirecting for 30 days)
            </p>
            <ul className="space-y-1">
              {aliases.map((a) => (
                <li
                  key={a.alias}
                  className="font-mono text-xs text-text-secondary flex items-center justify-between"
                >
                  <span>{a.alias}.piggyback.finance</span>
                  <span className="text-text-tertiary">
                    until {new Date(a.expires_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
