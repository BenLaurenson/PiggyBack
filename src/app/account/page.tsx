/**
 * Hosted-platform account page on piggyback.finance.
 *
 * For an authenticated user (Google sign-in), shows:
 *   - their subdomain link
 *   - subscription status + manage-billing button (Stripe Customer Portal)
 *   - cancel-anytime explainer
 *   - delete-my-account flow
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Nunito, DM_Sans } from "next/font/google";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { getProvisionByGoogleSub } from "@/lib/provisioner/state-machine";
import { AccountActions } from "./account-actions";

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

export const metadata = {
  title: "Account — PiggyBack",
};

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "text-accent-teal" },
  past_due: { label: "Payment failed", tone: "text-amber-700" },
  canceled: { label: "Cancelled", tone: "text-text-tertiary" },
  trialing: { label: "Trial", tone: "text-accent-teal" },
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/account");

  const provision = await getProvisionByGoogleSub(user.id);
  if (!provision) redirect("/get-started");

  const subdomain = provision.subdomain_vanity ?? provision.subdomain_short_id;
  const fullHost = subdomain ? `${subdomain}.piggyback.finance` : null;
  const subStatus = STATUS_COPY[provision.subscription_status ?? ""] ?? {
    label: provision.subscription_status ?? "Setting up",
    tone: "text-text-tertiary",
  };

  return (
    <div className={`mint min-h-screen ${nunito.variable} ${dmSans.variable}`}>
      <LandingHeader />

      <section className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <h1 className="font-[family-name:var(--font-nunito)] font-black text-3xl md:text-4xl text-text-primary mb-2">
          Your account
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary mb-10">
          {user.email}
        </p>

        {/* Deployment */}
        <div className="rounded-3xl bg-surface-white-60 border border-border-light p-6 md:p-8 mb-6">
          <p className="font-[family-name:var(--font-nunito)] font-bold text-xs uppercase tracking-wider text-text-tertiary mb-2">
            Your PiggyBack
          </p>
          {fullHost ? (
            <a
              href={`https://${fullHost}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-lg text-brand-coral hover:underline inline-flex items-center gap-2"
            >
              {fullHost}
              <ExternalLink className="w-4 h-4" />
            </a>
          ) : (
            <span className="text-text-tertiary">Provisioning in progress — check back soon.</span>
          )}
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary mt-3">
            Status: <span className={subStatus.tone}>{subStatus.label}</span>
          </p>
        </div>

        {/* Actions */}
        <AccountActions
          provisionId={provision.id}
          hasStripeCustomer={!!provision.stripe_customer_id}
          subscriptionStatus={provision.subscription_status}
          subdomain={subdomain ?? undefined}
        />

        {/* The cancel pitch */}
        <div className="rounded-3xl bg-pastel-mint-light border border-pastel-mint p-6 md:p-8 mt-6">
          <h2 className="font-[family-name:var(--font-nunito)] font-bold text-lg text-text-primary mb-2">
            Cancel anytime, keep your app
          </h2>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm text-text-secondary leading-relaxed">
            On cancellation we stop pushing updates and remove your{" "}
            <code className="font-mono">*.piggyback.finance</code> subdomain
            after a 14-day grace period. Your Vercel project keeps running.
            Your Supabase keeps your data. You can attach a different
            domain or just use your <code className="font-mono">.vercel.app</code> URL
            forever, free.
          </p>
        </div>

        <p className="text-center mt-12 font-[family-name:var(--font-dm-sans)] text-xs text-text-tertiary">
          <Link href="/privacy" className="hover:text-brand-coral">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="hover:text-brand-coral">
            Terms
          </Link>
        </p>
      </section>

      <LandingFooter />
    </div>
  );
}
