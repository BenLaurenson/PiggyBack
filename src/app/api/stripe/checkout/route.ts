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

  return NextResponse.json({ url: session.url });
}
