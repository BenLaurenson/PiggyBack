"use client";

import { useState, useTransition } from "react";
import { Loader2, ExternalLink, Trash2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { deleteAccount } from "@/app/actions/delete-account";

interface Props {
  provisionId: string;
  hasStripeCustomer: boolean;
  subscriptionStatus: string | null;
  subdomain?: string;
}

export function AccountActions({
  provisionId,
  hasStripeCustomer,
  subscriptionStatus,
  subdomain,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, startDelete] = useTransition();

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provisionId }),
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else throw new Error(d.error ?? "Could not open billing portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setError(null);
    startDelete(async () => {
      const r = await deleteAccount({ provisionId });
      if (r.error) {
        setError(r.error);
      } else {
        window.location.href = "/?deleted=1";
      }
    });
  }

  return (
    <div className="rounded-3xl bg-white border border-border-light p-6 md:p-8 mb-6 space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 font-[family-name:var(--font-dm-sans)]">
          {error}
        </div>
      )}

      <div>
        <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider text-text-tertiary mb-2">
          Billing
        </p>
        {hasStripeCustomer ? (
          <Button onClick={openPortal} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Manage subscription
            <ExternalLink className="w-3.5 h-3.5 ml-2" />
          </Button>
        ) : (
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary">
            No subscription on file.
          </p>
        )}
        <p className="font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary mt-2">
          Update payment method, view invoices, or cancel via the Stripe portal.
          Cancellation is one click — your app stays put.
        </p>
      </div>

      <hr className="border-border-light" />

      <div>
        <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider text-text-tertiary mb-2">
          Danger zone
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete my PiggyBack account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your PiggyBack account?</DialogTitle>
              <DialogDescription className="space-y-3 pt-2">
                <span className="block">
                  This <strong>only</strong> removes your PiggyBack management
                  record. Your Supabase project, your Vercel deployment, and
                  your data <strong>stay yours</strong>.
                </span>
                <span className="block">
                  We will:
                </span>
                <ul className="list-disc list-inside space-y-1 pl-2 text-sm">
                  <li>Cancel your subscription via Stripe</li>
                  <li>Revoke our OAuth access to your Supabase + Vercel</li>
                  <li>
                    Remove the <code className="font-mono text-xs">*.piggyback.finance</code> subdomain after a 14-day grace period
                  </li>
                  <li>Delete the orchestrator-side row tracking your account</li>
                </ul>
                <span className="block">
                  Afterwards you can:
                </span>
                <ul className="list-disc list-inside space-y-1 pl-2 text-sm">
                  <li>
                    Keep using PiggyBack at the auto-generated{" "}
                    <code className="font-mono text-xs">*.vercel.app</code> URL forever (free)
                  </li>
                  <li>
                    Attach your own custom domain to the Vercel project
                  </li>
                  <li>
                    Or, if you really want a clean break:{" "}
                    {subdomain && (
                      <>
                        <a
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-coral underline"
                        >
                          delete the Supabase project
                        </a>{" "}
                        and{" "}
                        <a
                          href="https://vercel.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-coral underline"
                        >
                          delete the Vercel project
                        </a>{" "}
                        yourself.
                      </>
                    )}
                  </li>
                </ul>
                <span className="block pt-2">
                  Type <strong>DELETE</strong> to confirm:
                </span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border-medium font-mono text-sm"
                  placeholder="DELETE"
                />
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={confirmText !== "DELETE" || isDeleting}
                onClick={confirmDelete}
              >
                {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Yes, delete my account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
