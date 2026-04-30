/**
 * Hosted-platform onboarding wizard. Server component that reads the user's
 * session, finds/creates a piggyback_provisions row, and renders the right
 * step based on current state.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { upsertProvisionForUser, type ProvisionRow } from "@/lib/provisioner/state-machine";
import { GetStartedClient } from "./get-started-client";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"],
});

export const metadata = { title: "Get started — PiggyBack Hosted" };

const STEP_ORDER = [
  { state: "SIGNED_IN", label: "Sign in" },
  { state: "SUPABASE_AUTHED", label: "Connect Supabase" },
  { state: "VERCEL_AUTHED", label: "Connect Vercel" },
  { state: "SUPABASE_PROVISIONED", label: "Provision database" },
  { state: "MIGRATIONS_RUN", label: "Run migrations" },
  { state: "VERCEL_PROVISIONED", label: "Create deployment" },
  { state: "ENV_VARS_SET", label: "Configure environment" },
  { state: "DOMAIN_ATTACHED", label: "Attach subdomain" },
  { state: "UP_PAT_PROVIDED", label: "Connect Up Bank" },
  { state: "WEBHOOK_REGISTERED", label: "Activate webhook" },
  { state: "READY", label: "Ready" },
];

function isAtOrAfter(current: ProvisionRow["state"], target: string): boolean {
  const states = STEP_ORDER.map((s) => s.state);
  const ci = states.indexOf(current);
  const ti = states.indexOf(target);
  return ci >= ti && ci !== -1 && ti !== -1;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://piggyback.finance";
}

function buildSupabaseAuthUrl(provisionId: string): string {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID ?? "";
  const redirect = `${appUrl()}/oauth/supabase/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirect,
    state: provisionId,
    scope: "all",
  });
  return `https://api.supabase.com/v1/oauth/authorize?${params.toString()}`;
}

function buildVercelIntegrationUrl(provisionId: string): string {
  const slug = process.env.NEXT_PUBLIC_VERCEL_INTEGRATION_SLUG ?? "piggyback";
  const params = new URLSearchParams({ state: provisionId });
  return `https://vercel.com/integrations/${slug}/new?${params.toString()}`;
}

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to existing Supabase Auth Google sign-in — once that completes
    // and the user lands back here, we'll create their provision row.
    redirect("/sign-in?next=/get-started");
  }

  // Use the email + Supabase Auth user id ("sub" equivalent) to find/create
  // the provision row.
  const provision = await upsertProvisionForUser({
    googleSub: user.id,
    email: user.email ?? "no-email@example.com",
    displayName: user.user_metadata?.full_name ?? undefined,
    avatarUrl: user.user_metadata?.avatar_url ?? undefined,
  });

  const errorParam = typeof params.error === "string" ? params.error : null;
  const checkoutParam = typeof params.checkout === "string" ? params.checkout : null;

  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <section className="pt-12 md:pt-20 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="font-[family-name:var(--font-nunito)] font-bold text-sm text-brand-coral-hover uppercase tracking-wider mb-2">
            Hosted onboarding
          </p>
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl md:text-4xl font-black text-text-primary mb-2">
            Welcome, {user.user_metadata?.full_name ?? user.email}
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-8">
            Your subdomain will be{" "}
            <code className="font-mono text-sm bg-surface-white-60 px-2 py-0.5 rounded border border-border-light">
              {provision.subdomain_vanity ?? provision.subdomain_short_id}
              .piggyback.finance
            </code>
            . You can change it later from Settings.
          </p>

          {errorParam && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 mb-6 text-sm text-red-800 font-[family-name:var(--font-dm-sans)]">
              <strong>Something went wrong:</strong>{" "}
              <span className="font-mono">{errorParam}</span>. Try again, or
              email <a href="mailto:hello@piggyback.finance" className="underline">support</a>.
            </div>
          )}

          {checkoutParam === "cancelled" && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 mb-6 text-sm text-amber-800 font-[family-name:var(--font-dm-sans)]">
              Checkout cancelled. You can come back to this page any time to pick up where you left off.
            </div>
          )}

          {/* Progress strip */}
          <ol className="space-y-2 mb-10">
            {STEP_ORDER.map((step) => {
              const done = isAtOrAfter(provision.state, step.state) && provision.state !== "FAILED";
              return (
                <li
                  key={step.state}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    done
                      ? "bg-accent-teal-light border-accent-teal/40"
                      : provision.state === step.state
                      ? "bg-white border-brand-coral"
                      : "bg-white/40 border-border-light"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      done
                        ? "bg-accent-teal text-white"
                        : provision.state === step.state
                        ? "bg-brand-coral text-white"
                        : "bg-border-light text-text-tertiary"
                    }`}
                  >
                    {done ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : provision.state === step.state ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                  </span>
                  <span
                    className={`font-[family-name:var(--font-dm-sans)] text-sm ${
                      done || provision.state === step.state
                        ? "text-text-primary font-medium"
                        : "text-text-tertiary"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          <GetStartedClient
            provisionId={provision.id}
            currentState={provision.state}
            subdomain={provision.subdomain_vanity ?? provision.subdomain_short_id ?? ""}
            stripeCustomerExists={!!provision.stripe_customer_id}
            checkoutSuccess={checkoutParam === "success"}
            supabaseAuthUrl={buildSupabaseAuthUrl(provision.id)}
            vercelIntegrationUrl={buildVercelIntegrationUrl(provision.id)}
          />

          <div className="mt-12 text-center">
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 font-[family-name:var(--font-dm-sans)] text-sm text-text-tertiary hover:text-brand-coral"
            >
              Skip to your account
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
