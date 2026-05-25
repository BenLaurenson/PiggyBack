# Task 6 Brief — verified inputs for wise-api.ts

Generated 2026-05-25 from live API verification against a real Wise Business account. **Supersedes** any conflicting detail in `endpoints.md` or any third-party reference.

Redacted response samples that back every claim below live in `response-samples/`:

- `01-profiles.json` — `GET /v2/profiles`
- `02-balances.json` — `GET /v4/profiles/{profileId}/balances?types=STANDARD`
- `03-statement-flat-aud.json` — statement, FLAT, AUD (pure same-currency activity)
- `04-statement-compact-aud.json` — statement, COMPACT, AUD
- `05-statement-flat-foreign.json` — statement, FLAT, USD (contains `exchangeDetails`, `CONVERSION`, `TRANSFER`, `CARD` with FX)

## Base URL (live)

`https://api.wise.com`

`api-mtls.transferwise.com` is **not** needed for the read-only endpoints in this module (statements, balances, profiles). Plain TLS only.

## Auth header

`Authorization: Bearer <WISE_API_TOKEN>`

Confirmed on every successful call. No additional headers required, but `Accept: application/json` is good hygiene.

## profile.type

- **Exact string values:** `"PERSONAL"`, `"BUSINESS"`. Always uppercase.
- **Comparison:** **case-sensitive equality.** Do not do `.toUpperCase()` matching; the API contract is uppercase.

## Statement endpoint

- **Path:** `GET /v1/profiles/{profileId}/balance-statements/{balanceId}/statement.json`
  - `{balanceId}` is the `id` from `/v4/profiles/{profileId}/balances` (i.e. the balance id, **not** a borderless-account id).
- **Required query params:**
  - `currency` (string, ISO 4217 uppercase, e.g. `AUD`) — must match the balance's currency.
  - `intervalStart` (ISO 8601 with `Z`, e.g. `2026-01-01T00:00:00.000Z`)
  - `intervalEnd` (ISO 8601 with `Z`, e.g. `2026-05-25T23:59:59.999Z`)
- **Recommended query param:**
  - `type=FLAT` — confirmed to return numeric `amount.value` and full nested details. The COMPACT variant returned identical structure in our test; FLAT is the safer explicit default.
- **Pagination:** **None.** There is no cursor, page token, or "next" field at any level of the response. The sync worker must paginate by date-windowing `intervalStart` / `intervalEnd`. Wise's documented hard cap is 469 days per call.

## TypeScript interfaces — derived from real responses

These shapes are taken directly from the redacted samples. Optional/nullable annotations reflect what was observed.

```ts
// ───────────── Profiles ─────────────

export type WiseProfileType = "PERSONAL" | "BUSINESS";

export interface WiseProfile {
  id: number;
  publicId: string;          // UUID
  userId: number;
  type: WiseProfileType;
  address: WiseAddress;
  email: string;
  createdAt: string;         // ISO 8601 (no Z on some entries; treat as string)
  updatedAt: string;
  version: number;
  obfuscated: boolean;
  avatar: string | null;
  currentState: string;      // observed: "VISIBLE"
  contactDetails: { email: string; phoneNumber: string };
  contractingWithWise: boolean;
  // Business-only fields (PERSONAL profiles will lack these):
  profileRole?: string;       // observed: "DIRECT_CUSTOMER_PROFILE"
  creatorClientId?: string;   // observed: "transferwise_web"
  businessName?: string;
  registrationNumber?: string;
  descriptionOfBusiness?: string;
  webpage?: string;
  companyType?: string;       // observed: "SOLE_TRADER"
  companyRole?: string;       // observed: "OWNER"
  abn?: string;
  firstLevelCategory?: string;
  secondLevelCategory?: string;
  industryCategories?: string[];
  operationalAddresses?: WiseAddress[];
  onboardingFlow?: string;
  // Personal-only fields:
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  placeOfBirth?: {
    rawValue: string | null;
    city: string | null;
    countryIso2Code: string | null;
    countryIso3Code: string | null;
    postCode: string | null;
    stateCode: string | null;
  };
  phoneNumber?: string;
  secondaryAddresses?: WiseAddress[];
  jointProfile?: boolean;
  // Common tail:
  dataObfuscated: boolean;
  partner: boolean;
  partnerCustomer: boolean;
  fullName: string;
}

export interface WiseAddress {
  id: number;
  addressFirstLine: string;
  city: string;
  countryIso2Code: string;
  countryIso3Code: string;
  postCode: string;
  stateCode: string;
}

// ───────────── Balances ─────────────

export type WiseBalanceType = "STANDARD" | "SAVINGS" | "JAR";       // STANDARD confirmed; others speculative
export type WiseInvestmentState = "NOT_INVESTED" | "INVESTED";       // NOT_INVESTED confirmed; INVESTED speculative

export interface WiseMoney {
  value: number;
  currency: string;
}

export interface WiseBalance {
  id: number;
  currency: string;
  amount: WiseMoney;
  reservedAmount: WiseMoney;
  cashAmount: WiseMoney;
  totalWorth: WiseMoney;
  type: WiseBalanceType;
  name: string | null;
  icon: string | null;
  investmentState: WiseInvestmentState;
  creationTime: string;       // ISO 8601 with Z
  modificationTime: string;
  visible: boolean;
  primary: boolean;
  groupId: number | null;
  recipientId: number;
}

// ───────────── Statement ─────────────

// Note: every monetary object inside the statement payload carries an extra
// `zero: boolean` convenience flag. It's not in the balances response.
export interface WiseStatementMoney {
  value: number;
  currency: string;
  zero: boolean;
}

export type WiseTransactionType = "CREDIT" | "DEBIT";

export type WiseTransactionDetailType =
  | "CARD"
  | "DEPOSIT"
  | "TRANSFER"
  | "CONVERSION"
  | "MONEY_ADDED";

export interface WiseCardDetails {
  type: "CARD";
  description: string;
  amount: WiseStatementMoney;        // original-currency amount (e.g. AUD merchant amount on a USD-funded card)
  category: string;                  // merchant category string, may be truncated
  merchant: {
    name: string;
    firstLine: string | null;
    postCode: string;
    city: string;
    state: string | null;
    country: string;                 // ISO2
    category: string;
  };
  cardLastFourDigits: string;
  cardHolderFullName: string;
}

export interface WiseDepositDetails {
  type: "DEPOSIT";
  description: string;
  senderName: string;
  senderAccount: string;
  paymentReference: string;
  recipientAccountNumber: string;
  recipientAccountDetailsId: number | null;
}

export interface WiseTransferDetails {
  type: "TRANSFER";
  description: string;
  recipient: { name: string; bankAccount: string };
  paymentReference: string;
  creatorTrackingId: string | null;
}

export interface WiseConversionDetails {
  type: "CONVERSION";
  description: string;
  sourceAmount: WiseStatementMoney;
  targetAmount: WiseStatementMoney;
  rate: number;
}

export interface WiseMoneyAddedDetails {
  type: "MONEY_ADDED";
  description: string;
}

export type WiseTransactionDetails =
  | WiseCardDetails
  | WiseDepositDetails
  | WiseTransferDetails
  | WiseConversionDetails
  | WiseMoneyAddedDetails;

export interface WiseExchangeDetails {
  toAmount: WiseStatementMoney;
  fromAmount: WiseStatementMoney;
  rate: number;
}

export interface WiseStatementTransaction {
  type: WiseTransactionType;              // CREDIT | DEBIT (matches sign of amount.value)
  date: string;                            // ISO 8601 with Z and microsecond precision
  amount: WiseStatementMoney;              // signed
  totalFees: WiseStatementMoney;
  details: WiseTransactionDetails;
  exchangeDetails: WiseExchangeDetails | null;
  runningBalance: WiseStatementMoney;
  referenceNumber: string;                 // PREFIX-DIGITS, see below
  attachment: unknown | null;              // null in every observed case
  activityAssetAttributions: unknown[];    // empty in every observed case
}

export interface WiseStatement {
  accountHolder: {
    type: WiseProfileType;
    profileId: number;
    address: WiseAddress;
    businessName?: string;
    registrationNumber?: string;
    companyType?: string;
  };
  issuer: {
    name: string;
    firstLine: string;
    city: string;
    postCode: string;
    stateCode: string | null;
    countryCode: string;
    country: string;
  };
  issuers: {
    payments: WiseStatement["issuer"];
    assets: unknown[];
  };
  bankDetails: unknown;        // shape varies per currency; treat opaque for Phase 1A
  transactions: WiseStatementTransaction[];
  startOfStatementBalance: WiseStatementMoney;
  endOfStatementBalance: WiseStatementMoney;
  endOfStatementUnrealisedGainLoss: unknown | null;
  balanceAssetConfiguration: unknown | null;
  query: {
    intervalStart: string;
    intervalEnd: string;
    type: "FLAT" | "COMPACT";
    splitRefundFees: boolean;
    addStamp: boolean;
    currency: string;
    profileId: number;
    timezone: string;
  };
  request: {
    id: string;                // UUID
    creationTime: string;
    profileId: number;
    currency: string;
    balanceId: number;
    balanceName: string | null;
    intervalStart: string;
    intervalEnd: string;
    formatSpecificConfiguration: unknown | null;
  };
  feeSummary: {
    summaryTitle: string;
    fromTitle: string;
    toTitle: string;
    feesTitle: string;
    feeSummaryItems: unknown[];
  };
  locale: { code: string };
}
```

## Idempotency key for `business_transactions.wise_transaction_id`

- **`referenceNumber` is the primary handle** — always present, string-typed, stable.
- **Format pattern:** `PREFIX-DIGITS`, e.g. `CARD-3817733853`, `TRANSFER-2144601303`, `BALANCE-NNN`, `FEE-TRANSFER-NNN`.
- **Treat as opaque** — do not branch on the prefix; use `details.type` (or top-level `type`) for behavioural dispatch.
- **CRITICAL: `referenceNumber` is NOT unique by itself.** Verified live: a single Wise `referenceNumber` like `CARD-3241271489` can produce both a `DEBIT` (charge) and `CREDIT` (refund) ledger entry on the same balance — they share the same reference. Two such pairs appeared in 114 USD transactions. The unique key is at least the composite `(referenceNumber, type)` per balance, and for FX-spanning entries that share the reference across balances, the full key is `(referenceNumber, type, balanceId)` or `(referenceNumber, type, currency)`.
- **Recommendation:** `business_transactions.wise_transaction_id` should store a composite synthetic key, e.g. `${referenceNumber}:${type}:${balanceId}`, or use a `UNIQUE (wise_reference_number, wise_transaction_direction, wise_balance_id)` constraint instead of a single-column unique index on `referenceNumber`.

## Surprises / gotchas

1. **`borderless-accounts` path expects the borderless-account id, not the balance id.** The naming overlap caused 404s during verification. Use the `balance-statements` path with the balance id instead — it's the modern variant and aligns with `/v4/profiles/{profileId}/balances`.
2. **`amount.zero` flag is undocumented but pervasive** in statement responses. Don't be surprised by it; expose it on the interface for consumers that care, or ignore it (`value === 0` is equivalent).
3. **FX legs and refund pairs reuse `referenceNumber`.** Within a single balance, a Wise transaction can produce a `DEBIT` (charge) and `CREDIT` (refund) ledger entry sharing the same `referenceNumber`. Across balances, FX legs of the same operation also share the reference. See "Idempotency key" section above — the unique constraint must be composite, not single-column.
4. **`details.type` value `MONEY_ADDED`** appeared in the USD sample as a credit with no FX origin shown in `details` (only via `exchangeDetails`). Treat it as a deposit-like inbound.
5. **`details.category` (CARD)** is sometimes truncated by Wise (e.g. `"Computers, Computer Peripheral E"`). Do not rely on it for taxonomy.
6. **Date format has microsecond precision** (`...Z` with 6 fractional digits). `new Date(...)` in JS parses it correctly but drops precision to ms.
7. **`/v2/profiles` returns PERSONAL profiles too.** Filter by `type === "BUSINESS"` to get the business profile. If a user has multiple business profiles, additional logic is needed (out of scope for Phase 1A; raise a clear error).
8. **`types=STANDARD` is required on `/v4/profiles/.../balances`** — without it the response may be empty or 400.
9. **The Wise issuer (Wise's corporate entity) details on statements** (`issuer`, `bankDetails`) are stable per region and not customer-specific. Phase 1A can ignore them — they are not needed for transaction ingest.
10. **No cursor pagination on statement endpoint.** The Phase 1A `getStatementPage` wrapper should accept a `nextCursor` param for shape parity with other clients, but it must be a no-op for the statement path. The sync worker chunks by date.
