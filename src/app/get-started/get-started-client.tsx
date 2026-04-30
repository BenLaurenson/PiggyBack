"use client";

/**
 * Client-side step actions for /get-started. Buttons that:
 *   - Open the Supabase OAuth consent URL (includes provision_id in `state`)
 *   - Open the Vercel integration install URL
 *   - Hit /api/stripe/checkout to start subscription
 *   - Poll /api/provision/execute to drive provisioning forward
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  provisionId: string;
  currentState: string;
  subdomain: string;
  stripeCustomerExists: boolean;
  checkoutSuccess: boolean;
  supabaseAuthUrl: string;
  vercelIntegrationUrl: string;
}

export function GetStartedClient(props: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateView, setStateView] = useState(props.currentState);

  // Auto-drive provisioning steps that don't need user input.
  useEffect(() => {
    const driveable = [
      "SUPABASE_AUTHED",
      "SUPABASE_PROVISIONED",
      "MIGRATIONS_RUN",
      "VERCEL_AUTHED",
      "VERCEL_PROVISIONED",
      "ENV_VARS_SET",
    ];
    if (!driveable.includes(stateView)) return;
    if (busy) return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const resp = await fetch("/api/provision/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provisionId: props.provisionId }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error ?? "Provisioning step failed");
        if (!cancelled) setStateView(data.state ?? stateView);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stateView, busy, props.provisionId]);

  const supabaseAuthUrl = props.supabaseAuthUrl;
  const vercelIntegrationUrl = props.vercelIntegrationUrl;

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provisionId: props.provisionId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white border border-border-light p-6 md:p-8">
      <h2 className="font-[family-name:var(--font-nunito)] font-bold text-xl text-text-primary mb-3">
        Next step
      </h2>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {stateView === "SIGNED_IN" && !props.stripeCustomerExists && (
        <div>
          <p className="text-sm text-text-secondary mb-4 font-[family-name:var(--font-dm-sans)]">
            Start your A$19/month subscription. We&apos;ll provision your
            Supabase + Vercel after the first payment goes through.
          </p>
          <button
            onClick={startCheckout}
            disabled={busy}
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark text-white px-6 py-3 rounded-2xl transition-all disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Continue to checkout
          </button>
        </div>
      )}

      {(stateView === "SIGNED_IN" && props.stripeCustomerExists) ||
      stateView === "READY" ? null : null}

      {props.checkoutSuccess && stateView === "SIGNED_IN" && (
        <div className="mb-4 rounded-xl bg-accent-teal-light border border-accent-teal/40 px-4 py-3 text-sm text-text-medium">
          Payment received — connect Supabase next.
        </div>
      )}

      {(stateView === "SIGNED_IN" && props.stripeCustomerExists) && (
        <div>
          <p className="text-sm text-text-secondary mb-4 font-[family-name:var(--font-dm-sans)]">
            Authorize PiggyBack to create a project in your Supabase
            organization. We&apos;ll provision a free-tier project in the Sydney
            region.
          </p>
          <a
            href={supabaseAuthUrl}
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-text-primary hover:bg-text-medium text-white px-6 py-3 rounded-2xl transition-all"
          >
            Authorize Supabase
          </a>
        </div>
      )}

      {stateView === "SUPABASE_AUTHED" && (
        <BusyStep label="Provisioning your Supabase project (region: Sydney)..." />
      )}
      {stateView === "SUPABASE_PROVISIONED" && (
        <BusyStep label="Running migrations..." />
      )}

      {stateView === "MIGRATIONS_RUN" && (
        <div>
          <p className="text-sm text-text-secondary mb-4 font-[family-name:var(--font-dm-sans)]">
            Database is ready. Authorize PiggyBack on Vercel so we can deploy
            your app.
          </p>
          <a
            href={vercelIntegrationUrl}
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-text-primary hover:bg-text-medium text-white px-6 py-3 rounded-2xl transition-all"
          >
            Authorize Vercel
          </a>
        </div>
      )}

      {stateView === "VERCEL_AUTHED" && (
        <BusyStep label="Creating your Vercel project..." />
      )}
      {stateView === "VERCEL_PROVISIONED" && (
        <BusyStep label="Setting environment variables..." />
      )}
      {stateView === "ENV_VARS_SET" && (
        <BusyStep label={`Attaching ${props.subdomain}.piggyback.finance...`} />
      )}

      {stateView === "DOMAIN_ATTACHED" && (
        <div>
          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-base text-text-primary mb-2">
            Almost there — connect Up Bank inside your new app
          </h3>
          <p className="text-sm text-text-secondary mb-4 font-[family-name:var(--font-dm-sans)]">
            Open your fresh deployment, sign in, and paste your Up Bank Personal
            Access Token. We never see it — it&apos;s stored encrypted only in
            your own Supabase.
          </p>
          <a
            href={`https://${props.subdomain}.piggyback.finance/settings/up-connection`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark text-white px-6 py-3 rounded-2xl transition-all"
          >
            Open my deployment →
          </a>
          <p className="text-xs text-text-tertiary mt-3 font-[family-name:var(--font-dm-sans)]">
            Need a PAT? Generate one at{" "}
            <a
              href="https://api.up.com.au/getting_started"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              api.up.com.au/getting_started
            </a>
            .
          </p>
        </div>
      )}

      {stateView === "READY" && (
        <div>
          <h3 className="font-[family-name:var(--font-nunito)] font-bold text-base text-accent-teal mb-2">
            All set 🎉
          </h3>
          <p className="text-sm text-text-secondary mb-4 font-[family-name:var(--font-dm-sans)]">
            Your PiggyBack is live at{" "}
            <code className="font-mono text-xs bg-surface-white-60 px-1.5 py-0.5 rounded border border-border-light">
              {props.subdomain}.piggyback.finance
            </code>
            .
          </p>
          <a
            href={`https://${props.subdomain}.piggyback.finance/home`}
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-base bg-brand-coral hover:bg-brand-coral-dark text-white px-6 py-3 rounded-2xl transition-all"
          >
            Open your dashboard →
          </a>
        </div>
      )}

      {stateView === "FAILED" && (
        <div>
          <p className="text-sm text-red-700 mb-4 font-[family-name:var(--font-dm-sans)]">
            Provisioning ran into a problem. We&apos;ve logged it and can usually
            recover by retrying.
          </p>
          <button
            onClick={() => setStateView("SUPABASE_AUTHED")}
            className="inline-flex items-center gap-2 font-[family-name:var(--font-nunito)] font-bold text-sm bg-text-primary text-white px-5 py-2.5 rounded-xl"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function BusyStep({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-text-secondary font-[family-name:var(--font-dm-sans)]">
      <Loader2 className="w-4 h-4 animate-spin text-brand-coral" />
      {label}
    </div>
  );
}

