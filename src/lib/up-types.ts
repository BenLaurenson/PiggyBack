/**
 * Canonical Up Bank API types — single source of truth for the codebase.
 *
 * @see https://developer.up.com.au/ — official Up developer docs
 *
 * This module defines TypeScript types that mirror Up's resource schemas exactly.
 * All other files (UpApiClient, webhook handler, sync route) import from here.
 *
 * When Up changes the API, update this file first; downstream code follows.
 * Verify against context7 (`/websites/developer_up_au`) before editing.
 */

// ─── Money ───────────────────────────────────────────────────────────────────

export interface MoneyObject {
  /** ISO 4217 currency code (e.g., "AUD"). */
  currencyCode: string;
  /** Decimal-string amount in the major unit (e.g., "10.56"). Read `valueInBaseUnits` for arithmetic. */
  value: string;
  /** Integer amount in the smallest denomination (e.g., 1056 cents). 64-bit. */
  valueInBaseUnits: number;
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export type AccountTypeEnum = "SAVER" | "TRANSACTIONAL" | "HOME_LOAN";
export type OwnershipTypeEnum = "INDIVIDUAL" | "JOINT";

/** @see https://developer.up.com.au/#get_accounts */
export interface UpAccount {
  type: "accounts";
  id: string;
  attributes: {
    displayName: string;
    accountType: AccountTypeEnum;
    ownershipType: OwnershipTypeEnum;
    balance: MoneyObject;
    /** Date-time at which the account was first opened (ISO 8601). */
    createdAt: string;
  };
  relationships: {
    transactions: {
      links?: {
        related: string;
      };
    };
  };
  links?: {
    self: string;
  };
}

// ─── Transactions ────────────────────────────────────────────────────────────

export type TransactionStatusEnum = "HELD" | "SETTLED";

export type CardPurchaseMethodEnum =
  | "BAR_CODE"
  | "OCR"
  | "CARD_PIN"
  | "CARD_DETAILS"
  | "CARD_ON_FILE"
  | "ECOMMERCE"
  | "MAGNETIC_STRIPE"
  | "CONTACTLESS";

export interface CardPurchaseMethodObject {
  method: CardPurchaseMethodEnum;
  cardNumberSuffix: string | null;
}

export interface HoldInfoObject {
  amount: MoneyObject;
  foreignAmount: MoneyObject | null;
}

export interface RoundUpObject {
  amount: MoneyObject;
  boostPortion: MoneyObject | null;
}

export interface CashbackObject {
  description: string;
  amount: MoneyObject;
}

export interface NoteObject {
  /** Customer-attached note text. */
  text: string;
}

export interface CustomerObject {
  /** Up name or preferred name of the performing customer. */
  displayName: string;
  /** Optional deep link to the customer's transaction receipt screen. */
  deepLinkURL?: string;
}

/** @see https://developer.up.com.au/#get_transactions */
export interface UpTransaction {
  type: "transactions";
  id: string;
  attributes: {
    status: TransactionStatusEnum;
    rawText: string | null;
    description: string;
    message: string | null;
    isCategorizable: boolean;
    holdInfo: HoldInfoObject | null;
    roundUp: RoundUpObject | null;
    cashback: CashbackObject | null;
    amount: MoneyObject;
    foreignAmount: MoneyObject | null;
    cardPurchaseMethod: CardPurchaseMethodObject | null;
    settledAt: string | null;
    createdAt: string;
    /** Description of how the transaction was performed. Up's docs: nullable string. */
    transactionType: string | null;
    /** Customer-attached note (different from PiggyBack's user-authored notes). */
    note: NoteObject | null;
    performingCustomer: CustomerObject | null;
    /** Deep link into the Up app to view this transaction (e.g. "up://transaction/..."). */
    deepLinkURL?: string;
  };
  relationships: {
    account: {
      data: { type: "accounts"; id: string };
      links?: { related: string };
    };
    transferAccount: {
      data: { type: "accounts"; id: string } | null;
      links?: { related: string };
    };
    category: {
      data: { type: "categories"; id: string } | null;
      links?: { self: string; related?: string };
    };
    parentCategory: {
      data: { type: "categories"; id: string } | null;
      links?: { related: string };
    };
    tags: {
      data: Array<{ type: "tags"; id: string }>;
      links?: { self: string };
    };
    attachment: {
      data: { type: "attachments"; id: string } | null;
      links?: { related: string };
    };
  };
  links?: {
    self: string;
  };
}

// ─── Categories ──────────────────────────────────────────────────────────────

/** @see https://developer.up.com.au/#get_categories */
export interface UpCategory {
  type: "categories";
  id: string;
  attributes: {
    name: string;
  };
  relationships: {
    parent: {
      data: { type: "categories"; id: string } | null;
      links?: { related: string };
    };
    children: {
      data: Array<{ type: "categories"; id: string }>;
      links?: { related: string };
    };
  };
  links?: {
    self: string;
  };
}

// ─── Tags ────────────────────────────────────────────────────────────────────

/** @see https://developer.up.com.au/#get_tags */
export interface UpTag {
  type: "tags";
  /** The tag label is the unique identifier. */
  id: string;
  relationships?: {
    transactions?: {
      links?: { related: string };
    };
  };
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export type WebhookEventTypeEnum =
  | "PING"
  | "TRANSACTION_CREATED"
  | "TRANSACTION_SETTLED"
  | "TRANSACTION_DELETED";

/** @see https://developer.up.com.au/#post_webhooks */
export interface UpWebhook {
  type: "webhooks";
  id: string;
  attributes: {
    url: string;
    description: string | null;
    /** Returned only on creation; lost forever after that. */
    secretKey?: string;
    createdAt: string;
  };
  relationships: {
    logs: {
      links?: { related: string };
    };
  };
  links?: {
    self: string;
  };
}

export type WebhookDeliveryStatusEnum =
  | "DELIVERED"
  | "UNDELIVERABLE"
  | "BAD_RESPONSE_CODE";

/** @see https://developer.up.com.au/#get_webhooks_webhookId_logs */
export interface UpWebhookDeliveryLog {
  type: "webhook-delivery-logs";
  id: string;
  attributes: {
    request: { body: string };
    response: { statusCode: number; body: string } | null;
    deliveryStatus: WebhookDeliveryStatusEnum;
    createdAt: string;
  };
  relationships: {
    webhookEvent: {
      data: { type: "webhook-events"; id: string };
    };
  };
}

/**
 * Webhook event payload (POSTed to the registered URL).
 * @see https://developer.up.com.au/#callback_post_webhookURL
 */
export interface UpWebhookEvent {
  data: {
    type: "webhook-events";
    /** Stable across delivery retries — usable as an idempotency key. */
    id: string;
    attributes: {
      eventType: WebhookEventTypeEnum;
      /** Date-time the event was generated. */
      createdAt: string;
    };
    relationships: {
      webhook: {
        data: { type: "webhooks"; id: string };
        links?: { related: string };
      };
      transaction?: {
        data: { type: "transactions"; id: string };
        links?: { related: string };
      };
    };
  };
}

// ─── Pagination & Errors ─────────────────────────────────────────────────────

export interface UpPaginatedResponse<T> {
  data: T[];
  links: {
    prev: string | null;
    next: string | null;
  };
}

/** Single-resource response (no pagination links). */
export interface UpSingleResponse<T> {
  data: T;
}

/** Categories endpoint is documented as un-paginated; use this shape. */
export interface UpCategoriesResponse {
  data: UpCategory[];
}

/** /util/ping response */
export interface UpPingResponse {
  meta: {
    /** Authenticated customer's unique identifier. */
    id: string;
    /** Cute emoji representing the response status. */
    statusEmoji: string;
  };
}

export interface UpErrorObject {
  /** HTTP status code as a string. */
  status: string;
  title: string;
  detail: string;
  source?: {
    parameter?: string;
    /** RFC-6901 JSON pointer if the error relates to a request body attribute. */
    pointer?: string;
  };
}

export interface UpApiErrorPayload {
  errors: UpErrorObject[];
}
