# API Routes Reference

## Budget Endpoints

### Expenses
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET, POST | `/api/budget/expenses` | User + Partnership | List expenses with matches; create new expense with auto-emoji and backfill |
| PATCH, DELETE | `/api/budget/expenses/[id]` | User + Partnership | Update/delete expense; auto-rematch on update |
| GET | `/api/budget/expenses/auto-detect` | User + Partnership | AI-powered recurring expense detection with pattern fallback |
| POST, DELETE | `/api/budget/expenses/match` | User + Partnership | Manually match/unmatch transaction to expense; advances next_due_date |

### Budget Summary
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/budget/summary` | User + Partnership | Full budget summary for a specific budget and period; replaces 21+ parallel queries with a single API call that runs the budget engine |

### Zero-Based Budget
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/budget/zero/assign` | User + Partnership | Create/update budget assignment for category/goal/asset |

### Budget Configuration
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET, POST | `/api/budget/methodology` | User + Partnership | Get/set budgeting methodology (50-30-20, envelope, etc.) |
| GET, POST, DELETE | `/api/budget/methodology/customize` | User + Partnership | Customize methodology categories and percentages |
| GET, POST, DELETE | `/api/budget/layout` | User + Partnership | Manage budget layout presets with active state |
| GET, POST | `/api/budget/columns` | User + Partnership | Manage custom calculated columns with formulas |
| GET, POST, DELETE | `/api/budget/templates` | User + Partnership | Manage saved layout templates |

### Budget Sharing (Couples)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET, POST, DELETE, PATCH | `/api/budget/shares/categories` | User + Partnership | Category-level sharing percentages |
| GET, POST, DELETE | `/api/budget/splits` | User + Partnership | Couple split settings (equal/custom/individual) |
| GET, POST, DELETE | `/api/budget/transaction-overrides` | User + Partnership | Per-transaction share overrides (shared/individual, custom percentage) |

### Budget Data
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/budget/row-transactions` | User + Partnership | Transactions for a specific budget row within date period |
| GET | `/api/budget/historical-spending` | User + Partnership | Historical spending aggregated by parent categories |
| GET | `/api/budget/available-transactions` | User + Partnership | Recent unmatched expense transactions for linking in expense edit modal |

### Budget Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| DELETE | `/api/budget/reset` | User + Partnership | DEV ONLY: Reset budget setup |

## Transaction Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/transactions` | User | Search transactions with filters (date, amount, category, account), pagination |
| PATCH, DELETE | `/api/transactions/[id]/recategorize` | User | Local recategorization (not synced to UP Bank) |
| POST, DELETE | `/api/transactions/tags` | User | Add/remove tags on transactions |

## AI Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/ai/chat` | User | Main AI chat with streaming, multi-provider support, 35 financial tools |
| GET | `/api/ai/context` | User | Build financial context for AI assistant |
| GET, POST | `/api/ai/settings` | User | Store/retrieve AI provider configuration |

## Notification Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET, PATCH | `/api/notifications` | User | List notifications (with unread count); mark notifications as read (by ID or mark all) |
| POST | `/api/notifications/[id]/action` | User | Take action on a notification (update_amount or dismiss) |

## Cron Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/cron/notifications` | Cron/Service | Generate and send scheduled notifications (payment reminders, price changes, weekly summaries) |

## Expense Management
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/expenses/backfill-all` | User + Partnership | Backfill all expenses with historical transactions |
| POST | `/api/expenses/recalculate-periods` | User + Partnership | Recalculate for_period values for all matches |
| POST | `/api/expenses/rematch-all` | User + Partnership | Re-match all expense definitions |

## UP Bank Integration
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upbank/webhook` | HMAC Signature | Webhook handler for real-time transaction events |
| POST | `/api/upbank/sync` | User | Manual sync of accounts and transactions from UP Bank |

## Export
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/export/transactions` | User + Partnership | Export transactions as CSV or Markdown report |

## Debug (Development Only)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/debug/expenses` | User + Partnership | Debug expense definitions with full join data |

## Auth (Supabase Handlers)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/callback` | None | OAuth callback handler |
| GET | `/auth/confirm` | None | Email confirmation handler |
| GET | `/auth/signout` | User | Sign out handler |

---

## Endpoint Details

### `GET /api/budget/summary`

Full budget summary for a specific budget and date period. Runs the budget engine server-side.

**Query Parameters:**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `budget_id` | Yes | - | Budget UUID |
| `date` | Yes | - | Any date within the desired period (`YYYY-MM-DD`) |

**Response:** A full `BudgetSummary` object from the budget engine, including rows, totals, income, assigned, spent, and carryover values.

All amounts in cents (AUD).

---

### `POST /api/budget/zero/assign`

Create or update a budget assignment.

**Request Body:**
```json
{
  "partnership_id": "uuid",
  "month": "2026-02-01",
  "category_name": "Food & Dining",
  "subcategory_name": "Groceries",
  "assignment_type": "category",
  "assigned_cents": 50000,
  "stored_period_type": "monthly",
  "budget_view": "shared"
}
```

**Response:**
```json
{
  "success": true,
  "assignment": { "id": "uuid", "assigned_cents": 50000 },
  "view_total": 650000
}
```

---

### `GET /api/transactions`

List transactions with filtering and pagination.

**Query Parameters:**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `offset` | No | `0` | Pagination offset |
| `limit` | No | `25` | Results per page |
| `search` | No | - | Description search |
| `accountId` | No | `all` | Account UUID(s), comma-separated |
| `categoryId` | No | `all` | Category UUID(s), comma-separated |
| `dateRange` | No | - | `7d`, `30d`, `90d`, `6m`, `1y`, `this-month`, `last-month`, `all` |
| `startDate` | No | - | ISO8601 date |
| `endDate` | No | - | ISO8601 date |
| `status` | No | - | `HELD`, `SETTLED`, or `all` |
| `minAmount` | No | - | Minimum amount (dollars) |
| `maxAmount` | No | - | Maximum amount (dollars) |
| `includeTransfers` | No | `false` | Include internal transfers |

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "description": "Woolworths",
      "amount_cents": -4567,
      "created_at": "2026-02-01T10:30:00Z",
      "status": "SETTLED",
      "category": { "id": "groceries", "name": "Groceries" },
      "parent_category": { "id": "home", "name": "Home" },
      "accounts": { "display_name": "Spending" }
    }
  ],
  "total": 1234,
  "hasMore": true,
  "summary": {
    "spending": -456700,
    "income": 800000,
    "spendingCount": 85
  }
}
```

---

### `POST /api/ai/chat`

Stream AI chat responses with tool calling.

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "How much did I spend on groceries this month?" }
  ]
}
```

**Response:** Server-Sent Events stream (Vercel AI SDK format). Includes text chunks, tool calls, and tool results.

**Rate Limit:** 10 requests per minute per user. Returns `429` with `Retry-After` header when exceeded.

---

### `POST /api/upbank/webhook`

Receive and process UP Bank transaction events.

**Headers:** `X-Up-Authenticity-Signature: <HMAC-SHA256 signature>`

**Request Body:**
```json
{
  "data": {
    "type": "webhook-events",
    "id": "uuid",
    "attributes": {
      "eventType": "TRANSACTION_CREATED",
      "createdAt": "2026-02-01T10:30:00+11:00"
    },
    "relationships": {
      "webhook": { "data": { "type": "webhooks", "id": "uuid" } },
      "transaction": { "data": { "type": "transactions", "id": "uuid" } }
    }
  }
}
```

**Response:** `{ "success": true }` (200) on success.

**Side Effects:** Upserts transaction, updates account balances, matches to expenses/income, triggers AI categorization for uncategorized transactions, syncs linked savings goals, upserts net worth snapshot.

---

### `POST /api/export/transactions`

Export transactions as CSV or Markdown report.

**Request Body:**
```json
{
  "format": "csv",
  "dateFrom": "2026-01-01",
  "dateTo": "2026-02-01",
  "categoryFilter": "groceries"
}
```

**Response:** File download with appropriate `Content-Type` and `Content-Disposition` headers.
- CSV: `piggyback-transactions-YYYY-MM-DD.csv` (columns: Date, Description, Amount, Category, Subcategory, Status, Type)
- Markdown: `piggyback-report-YYYY-MM-DD.md` (sections: Overview, Spending by Category, Top Merchants)

---

### `POST /api/budget/expenses/match`

Manually match a transaction to an expense definition.

**Request Body:**
```json
{
  "expense_id": "uuid",
  "transaction_id": "uuid",
  "confidence": 1.0
}
```

**Response:** `{ "success": true }` (200).

**Side Effects:** Advances `next_due_date` for recurring expenses.

### `DELETE /api/budget/expenses/match`

**Query Parameters:** `transaction_id` (required UUID)

**Response:** `{ "success": true }` (200).

---

### `GET /api/notifications`

Fetch notifications for the authenticated user.

**Query Parameters:**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `unread_only` | No | `false` | Set to `"true"` to only return unread notifications |
| `limit` | No | `20` | Max number of notifications (capped at 50) |

**Response:**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "expense_amount_change",
      "title": "...",
      "body": "...",
      "read": false,
      "actioned": false,
      "metadata": {},
      "created_at": "2026-02-01T10:30:00Z"
    }
  ],
  "unread_count": 3
}
```

### `PATCH /api/notifications`

Mark notifications as read.

**Request Body:**
```json
{ "notification_ids": ["uuid1", "uuid2"] }
```
Or to mark all:
```json
{ "mark_all_read": true }
```

### `POST /api/notifications/[id]/action`

Take action on an actionable notification.

**Request Body:**
```json
{ "action": "update_amount" }
```

Supported actions: `update_amount` (updates expense amount and links transaction), `dismiss`.

---

### `GET /api/budget/available-transactions`

Returns recent unmatched expense transactions for a partnership, used by the transaction linking picker.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `partnership_id` | Yes | Partnership UUID |
| `search` | No | Description search filter |

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "description": "Netflix",
      "amount_cents": -1799,
      "settled_at": "2026-02-01T10:30:00Z",
      "status": "SETTLED"
    }
  ]
}
```

Returns up to 50 recent debit transactions that are not already matched to an expense.

---

### `GET/POST/DELETE /api/budget/transaction-overrides`

Manage per-transaction share overrides for couple budgets.

**GET Query Parameters:** `partnership_id`, `transaction_id` (both required)

**POST Request Body:**
```json
{
  "partnership_id": "uuid",
  "transaction_id": "uuid",
  "is_shared": true,
  "share_percentage": 60,
  "category_name": "Food & Dining",
  "notes": "Optional note"
}
```

**DELETE Query Parameters:** `partnership_id`, `transaction_id` (both required)

---

## Common Error Responses

All endpoints return errors in a consistent format:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Missing required parameters or invalid input |
| `401` | Missing or invalid authentication |
| `403` | User lacks permission (not a partnership member) |
| `404` | Resource not found |
| `429` | Rate limited (includes `Retry-After` header) |
| `500` | Internal server error |

All currency amounts are in **cents** (AUD). All dates use **ISO8601** format except `next_due_date` which uses `YYYY-MM-DD`.

---

## Authentication Patterns

### User Authentication
Most endpoints use:
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### Partnership Authorization
Partnership-scoped endpoints additionally verify membership:
```typescript
const { data: membership } = await supabase
  .from("partnership_members")
  .select("partnership_id")
  .eq("user_id", user.id)
  .single();
```

### Webhook Authentication
UP Bank webhook uses HMAC-SHA256 signature verification:
```typescript
const signature = request.headers.get("X-Up-Authenticity-Signature");
const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
// Timing-safe comparison
```
