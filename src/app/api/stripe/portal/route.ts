/**
 * Create a Stripe Customer Portal session so the user can manage payment
 * methods, view invoices, and cancel their subscription. Called from the
 * hosted dashboard / settings page.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createPortalSession } from "@/lib/provisioner/stripe-client";
import { getProvisionById } from "@/lib/provisioner/state-machine";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://piggyback.finance";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { provisionId?: string; returnUrl?: string };
  if (!body.provisionId) {
    return NextResponse.json({ error: "provisionId is required" }, { status: 400 });
  }

  const provision = await getProvisionById(body.provisionId);
  if (!provision?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer attached to this provision" },
      { status: 404 }
    );
  }

  const session = await createPortalSession({
    customerId: provision.stripe_customer_id,
    returnUrl: body.returnUrl ?? `${appUrl()}/account`,
  });

  return NextResponse.json({ url: session.url });
}
