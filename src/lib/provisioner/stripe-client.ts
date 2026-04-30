/**
 * Minimal Stripe REST client.
 *
 * @see https://stripe.com/docs/api
 *
 * Built on `fetch` so we don't need to install the official `stripe` package
 * tonight. Covers:
 *   - Create Customer
 *   - Create Checkout Session
 *   - Create Customer Portal Session
 *   - Verify webhook signature (custom HMAC implementation matching Stripe's
 *     V1 signing scheme)
 *
 * Stripe API key (restricted) lives in STRIPE_SECRET_KEY. Webhook secret in
 * STRIPE_WEBHOOK_SECRET. Price ID in STRIPE_PRICE_ID.
 */

import { createHmac, timingSafeEqual } from "crypto";

const BASE = "https://api.stripe.com";

export class StripeApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "StripeApiError";
    this.status = status;
    this.code = code;
  }
}

function getSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

async function stripeRequest<T>(
  path: string,
  body?: Record<string, string | number | boolean | string[] | undefined>,
  method: "GET" | "POST" | "DELETE" = "POST"
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getSecretKey()}`,
    "Stripe-Version": "2025-03-31.basil",
  };
  let formBody: string | undefined;
  if (body && method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    formBody = encodeForm(body);
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formBody,
  });
  if (!response.ok) {
    let detail = "";
    let code: string | undefined;
    try {
      const json = (await response.json()) as { error?: { message?: string; code?: string } };
      detail = json?.error?.message ?? JSON.stringify(json);
      code = json?.error?.code;
    } catch {
      detail = await response.text();
    }
    throw new StripeApiError(`Stripe ${response.status} on ${path}: ${detail}`, response.status, code);
  }
  return response.json() as Promise<T>;
}

/** Encode a flat object as form-url-encoded, supporting array values. */
function encodeForm(obj: Record<string, string | number | boolean | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      v.forEach((item, i) => params.append(`${k}[${i}]`, String(item)));
    } else {
      params.append(k, String(v));
    }
  }
  return params.toString();
}

// ─── Customers ───────────────────────────────────────────────────────────────

export interface StripeCustomer {
  id: string;
  email: string;
  name: string | null;
  metadata?: Record<string, string>;
}

export async function createCustomer(input: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}): Promise<StripeCustomer> {
  const body: Record<string, string> = { email: input.email };
  if (input.name) body.name = input.name;
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      body[`metadata[${k}]`] = v;
    }
  }
  return stripeRequest<StripeCustomer>("/v1/customers", body);
}

// ─── Checkout Sessions ───────────────────────────────────────────────────────

export interface StripeCheckoutSession {
  id: string;
  url: string;
  customer?: string;
  payment_status?: string;
  status?: string;
}

export async function createCheckoutSession(input: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Will be attached to the resulting subscription. */
  subscriptionMetadata?: Record<string, string>;
}): Promise<StripeCheckoutSession> {
  const body: Record<string, string | number | boolean | string[]> = {
    customer: input.customerId,
    mode: "subscription",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": 1,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
  };
  if (input.subscriptionMetadata) {
    for (const [k, v] of Object.entries(input.subscriptionMetadata)) {
      body[`subscription_data[metadata][${k}]`] = v;
    }
  }
  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", body);
}

// ─── Customer Portal ─────────────────────────────────────────────────────────

export interface StripePortalSession {
  id: string;
  url: string;
}

export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  return stripeRequest<StripePortalSession>("/v1/billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify a Stripe webhook signature.
 * @see https://stripe.com/docs/webhooks/signatures
 *
 * Stripe sends `Stripe-Signature: t=<timestamp>,v1=<signature>[,v0=<old>]`.
 * The signed payload is `${t}.${rawBody}`. v1 is HMAC-SHA-256 keyed by the
 * webhook secret, hex-encoded.
 *
 * Returns the parsed event JSON on success; throws on tamper or skew.
 */
export function verifyStripeWebhook<T = unknown>(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300
): T {
  if (!header) throw new Error("Missing Stripe-Signature header");

  const parts = header.split(",").reduce<Record<string, string[]>>((acc, part) => {
    const [k, v] = part.split("=");
    if (!k || !v) return acc;
    acc[k] = acc[k] || [];
    acc[k].push(v);
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) {
    throw new Error("Stripe-Signature header is missing t or v1");
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new Error("Invalid Stripe timestamp");
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) {
    throw new Error("Stripe webhook timestamp outside tolerance window");
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  const matched = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    if (sigBuf.length !== expectedBuf.length) return false;
    try {
      return timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });

  if (!matched) throw new Error("Stripe webhook signature mismatch");

  return JSON.parse(rawBody) as T;
}

// ─── Event types we care about ───────────────────────────────────────────────

export type StripeEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "customer.subscription.trial_will_end"
  | "invoice.payment_failed"
  | "invoice.payment_succeeded";

export interface StripeEvent<T = unknown> {
  id: string;
  type: StripeEventType | string;
  data: { object: T };
  created: number;
}
