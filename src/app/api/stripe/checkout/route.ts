/**
 * Create a Stripe Checkout Session for the hosted-platform subscription
 * (A$19/month). Called from /get-started or /pricing.
 *
 * On success, returns the Stripe-hosted Checkout URL which the client
 * redirects to. Stripe handles the entire payment flow; on completion they
 * redirect back to `success_url` which we set to /get-started?step=provision.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  createCheckoutSession,
  createCustomer,
} from "@/lib/provisioner/stripe-client";
import {
  attachStripeIds,
  getProvisionById,
} from "@/lib/provisioner/state-machine";
import { track } from "@/lib/analytics/server";
import { FunnelEvent } from "@/lib/analytics/events";
import { ANONYMOUS_ID_COOKIE } from "@/lib/analytics/anonymous-id";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://piggyback.finance";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { provisionId?: string };
  const { provisionId } = body;
  if (!provisionId) {
    return NextResponse.json({ error: "provisionId is required" }, { status: 400 });
  }

  const provision = await getProvisionById(provisionId);
  if (!provision) {
    return NextResponse.json({ error: "Provision not found" }, { status: 404 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "Stripe price not configured" }, { status: 500 });
  }

  // Create or reuse customer
  let customerId = provision.stripe_customer_id;
  if (!customerId) {
    const customer = await createCustomer({
      email: provision.email,
      name: provision.display_name ?? undefined,
      metadata: { provision_id: provision.id, google_sub: provision.google_sub },
    });
    customerId = customer.id;
    await attachStripeIds(provision.id, { customerId });
  }

  const session = await createCheckoutSession({
    customerId,
    priceId,
    successUrl: `${appUrl()}/get-started?step=connect&checkout=success`,
    cancelUrl: `${appUrl()}/get-started?checkout=cancelled`,
    subscriptionMetadata: { provision_id: provision.id },
  });

  // Phase 4 funnel: stripe_checkout_started fires once we have a Checkout
  // Session URL, just before the client redirects to it. Keyed by the
  // pb_aid anonymous-session cookie because the user has no Supabase user
  // ID yet (signup happens later, after Stripe redirects back).
  // Properties never include the customer ID, the session URL, or any
  // Stripe key — only the session ID, which is opaque + non-secret.
  const anonymousId = request.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null;
  void track(FunnelEvent.STRIPE_CHECKOUT_STARTED, {
    anonymousId,
    properties: {
      provision_id: provision.id,
      session_id: session.id,
    },
  });

  return NextResponse.json({ url: session.url });
}
