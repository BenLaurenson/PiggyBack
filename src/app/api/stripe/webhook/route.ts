/**
 * Stripe webhook handler.
 *
 * @see https://stripe.com/docs/webhooks
 *
 * Handled events:
 *   - checkout.session.completed         → mark customer as paid + ready to provision
 *   - customer.subscription.created      → snapshot subscription state
 *   - customer.subscription.updated      → snapshot subscription state
 *   - customer.subscription.deleted      → start grace-period subdomain teardown
 *   - invoice.payment_failed             → log + mark past_due
 *   - invoice.payment_succeeded          → log
 *
 * Signature verification uses Stripe's V1 scheme (HMAC-SHA-256 over
 * "<timestamp>.<rawBody>" keyed by STRIPE_WEBHOOK_SECRET, with a 5-minute
 * timestamp tolerance).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  type StripeEvent,
  verifyStripeWebhook,
} from "@/lib/provisioner/stripe-client";
import {
  attachStripeIds,
  audit,
  getProvisionByStripeCustomer,
  markSubscriptionCancelled,
} from "@/lib/provisioner/state-machine";

export const runtime = "nodejs";

interface CheckoutSession {
  id: string;
  customer: string;
  subscription: string | null;
  metadata?: Record<string, string>;
}

interface Subscription {
  id: string;
  customer: string;
  status: string;
  cancel_at: number | null;
  canceled_at: number | null;
  current_period_end: number | null;
  metadata?: Record<string, string>;
}

interface Invoice {
  id: string;
  customer: string;
  status: string;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: StripeEvent;
  try {
    event = verifyStripeWebhook(rawBody, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as CheckoutSession;
        const provisionId = session.metadata?.provision_id;
        if (provisionId) {
          await attachStripeIds(provisionId, {
            customerId: session.customer,
            subscriptionId: session.subscription ?? undefined,
            status: "active",
          });
          await audit(provisionId, "STRIPE_CHECKOUT_COMPLETED", { sessionId: session.id });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Subscription;
        const provision = await getProvisionByStripeCustomer(sub.customer);
        if (provision) {
          await attachStripeIds(provision.id, {
            customerId: sub.customer,
            subscriptionId: sub.id,
            status: sub.status,
          });
          await audit(provision.id, `STRIPE_${event.type.toUpperCase()}`, {
            status: sub.status,
            current_period_end: sub.current_period_end,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Subscription;
        const provision = await getProvisionByStripeCustomer(sub.customer);
        if (provision) {
          await markSubscriptionCancelled(provision.id, {
            canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : new Date(),
            gracePeriodDays: 14,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Invoice;
        const provision = await getProvisionByStripeCustomer(inv.customer);
        if (provision) {
          await audit(provision.id, "STRIPE_PAYMENT_FAILED", { invoiceId: inv.id });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const inv = event.data.object as Invoice;
        const provision = await getProvisionByStripeCustomer(inv.customer);
        if (provision) {
          await audit(provision.id, "STRIPE_PAYMENT_SUCCEEDED", { invoiceId: inv.id });
        }
        break;
      }

      default:
        // Many event types we don't care about — Stripe insists on a 200 anyway.
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    // Returning 500 makes Stripe retry, which is what we want for transient blips.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
