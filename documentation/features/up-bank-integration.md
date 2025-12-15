# UP Bank Integration

## Overview
PiggyBack integrates deeply with UP Bank (Australian neobank) via their REST API for real-time transaction syncing, account management, and tagging.

## API Client (`src/lib/up-api.ts`)

### UpApiClient Class
Created via `createUpApiClient(apiToken)`.

**Methods:**
- `ping()` - Verify token validity
- `getAccounts(params?)` - List all accounts (transactional + savers), filter by type/ownership
- `getAccount(id)` - Get single account details
- `getTransactions(params?)` - List transactions with filters (status, date range, category, tag)
- `getAccountTransactions(accountId, params?)` - Transactions for specific account
- `getTransaction(id)` - Single transaction details
- `getCategories(params?)` - Full category taxonomy (filter by parent)
- `getCategory(id)` - Get single category details
- `categorizeTransaction(transactionId, categoryId)` - Set or clear transaction category in UP
- `addTags(transactionId, tags: string[])` - Add tags to transaction
- `removeTags(transactionId, tags: string[])` - Remove tags from transaction
- `getAllPages<T>(initialResponse)` - Auto-paginate through all pages of a response

### Pagination
UP Bank API uses cursor-based pagination:
- Response includes `links.next` URL
- Client follows pagination automatically for full data fetch via `getAllPages<T>()`
- Safety limit: `MAX_PAGES = 100` to prevent infinite loops
- Default page size is 30 items per page

### Error Handling
`UpApiError` interface wraps API errors:
- Status code
- Error detail from UP Bank
- Used for user-facing error messages

### Exported Types
`UpAccount`, `UpTransaction`, `UpCategory`, `UpPaginatedResponse<T>`, `UpApiError`, `UpApiClient`

## Token Storage
- API token encrypted before storage in `up_api_configs` table
- Encryption uses `UP_API_ENCRYPTION_KEY` environment variable (AES via `src/lib/token-encryption.ts`)
- If `UP_API_ENCRYPTION_KEY` is not set, token stored in plaintext (development only)
- Token decrypted on-demand via `getPlaintextToken()` for API calls

## Server Actions (`src/app/actions/upbank.ts`)

### `connectUpBank(plaintextToken)`
1. Validate token by calling UP Bank `ping` endpoint
2. If `UP_API_ENCRYPTION_KEY` is set, encrypt token via `encryptToken()`
3. Store via RPC `upsert_up_api_config`

### `registerUpWebhook()`
1. Determine webhook URL via priority chain: `NEXT_PUBLIC_APP_URL` > `https://${VERCEL_URL}` > `WEBHOOK_BASE_URL` > `http://localhost:3000`
2. Call UP Bank `POST /api/v1/webhooks` with URL + description
3. Store `webhook_id`, `webhook_secret`, and `webhook_url` in `up_api_configs`
4. On storage failure, rolls back by deleting the webhook from UP Bank

### `deleteUpWebhook()`
1. Fetch user's webhook config from `up_api_configs`
2. Call UP Bank `DELETE /api/v1/webhooks/{id}` (404 treated as success)
3. Clear `webhook_id`, `webhook_secret`, `webhook_url` from database

### `pingWebhook()`
1. Fetch user's webhook config
2. Call UP Bank `POST /api/v1/webhooks/{id}/ping`
3. Triggers a PING event delivered to the webhook handler

## Webhook System

### Webhook Handler (`src/app/api/upbank/webhook/route.ts`)

Receives and processes UP Bank webhook events. Uses service role client (no user auth context) since events come directly from UP Bank.

#### Security
- HMAC-SHA256 signature verification via `verifySignature()`
- Signature in `X-Up-Authenticity-Signature` header
- Hex format validation (must be 64-char hex string) before comparison
- Timing-safe comparison (`timingSafeEqual`) to prevent timing attacks
- Webhook secret looked up from `up_api_configs` by `webhook_id` in payload
- `runtime = "nodejs"` (not Edge) to support `crypto` module

#### Event Types

1. **TRANSACTION_CREATED**: New transaction appeared
   - Fetch full transaction from UP Bank API via `fetchTransaction()`
   - Process via `processTransaction()` (see pipeline below)
   - On fetch failure: return 500 so UP Bank retries

2. **TRANSACTION_SETTLED**: Transaction settled (was held)
   - Same as CREATED: fetch full transaction and process
   - Fallback: if `fetchTransaction()` fails, directly update existing HELD record to SETTLED status
   - If neither works: return 500 for retry

3. **TRANSACTION_DELETED**: Transaction removed
   - `processTransactionDeletion()`:
     1. Find local transaction by `up_transaction_id`
     2. Delete associated `expense_matches` records
     3. Soft-delete transaction (set `status = "DELETED"`)

4. **PING**: Health check
   - Log and respond with 200 OK

#### Transaction Processing Pipeline (`processTransaction`)
1. **Account lookup** — Find account by `up_account_id` (no user_id filter, service role bypasses RLS)
2. **Balance update** — `updateAccountBalance()` for both source and transfer accounts
3. **Transfer account resolution** — Map UP transfer account ID to local account ID
4. **Category inference** — `inferCategoryId()` for rule-based categorization
5. **Merchant category rules** — Check `merchant_category_rules` table for user's explicit rules (takes precedence over inference)
6. **User override preservation** — Check `transaction_category_overrides` table (highest priority, preserves manual recategorizations)
7. **Transaction upsert** — Upsert to `transactions` table with `onConflict: "account_id,up_transaction_id"`
8. **Tag handling** — Upsert tags to `tags` table, link via `transaction_tags`
9. **Expense/income matching** — Negative amounts: `matchSingleTransactionToExpenses()`; Positive amounts: `matchSingleTransactionToIncomeSources()`
10. **AI categorization** — Fire-and-forget `aiCategorizeTransaction()` for uncategorized, categorizable transactions

#### Balance Update Side Effects (`updateAccountBalance`)
After updating the account balance in the `accounts` table:
1. **Goal sync** — Find savings goals linked to the account, update `current_amount_cents`, record `goal_contributions` (source: `"webhook_sync"`), mark as completed if target reached
2. **Net worth snapshot** — Upsert today's `net_worth_snapshots` with:
   - JOINT account deduplication (earliest `user_id` wins for same `up_account_id`)
   - Account breakdown JSON
   - Investment total (summed from `investments` table)

#### Path Revalidation
After processing any event, revalidates: `/home`, `/budget`, `/goals`, `/activity`, `/analysis`

## Initial Sync
During onboarding:
1. Fetch all accounts via `getAccounts()`
2. Store in `accounts` table with account_type, balance, ownership_type
3. Fetch categories via `getCategories()`
4. Store in `categories` table
5. Fetch 1 year of transactions via paginated `getTransactions()`
6. Upsert all transactions
7. Register webhook for future events

## Account Types
- **TRANSACTIONAL**: Main spending account
- **SAVER**: Savings/goal accounts
- **HOME_LOAN**: Home loan accounts
- Ownership: **INDIVIDUAL** or **JOINT** (2Up accounts)

## Key Files
- `src/lib/up-api.ts` - UP Bank API client
- `src/app/api/upbank/webhook/route.ts` - Webhook handler (814 lines)
- `src/app/actions/upbank.ts` - Connection + webhook management server actions
- `src/lib/token-encryption.ts` - Token encrypt/decrypt utilities
- `src/lib/infer-category.ts` - Rule-based category inference
- `src/lib/ai-categorize.ts` - AI-powered categorization (merchant cache + LLM)
- `src/lib/match-expense-transactions.ts` - Expense and income matching
- `documentation/up-bank-api/` - UP Bank API reference
