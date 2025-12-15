# Pagination & Error Handling

## Pagination

All list endpoints (except `/categories`) return paginated responses.

### Response Links

```json
{
  "data": [...],
  "links": {
    "prev": "https://api.up.com.au/api/v1/transactions?page[before]=...",
    "next": "https://api.up.com.au/api/v1/transactions?page[after]=..."
  }
}
```

- `links.prev` - URL for previous page (`null` if first page)
- `links.next` - URL for next page (`null` if last page)

### Pagination Parameters

| Parameter | Description |
|-----------|-------------|
| `page[size]` | Number of records per page (varies by endpoint) |

**Important:** Use `links.next`/`links.prev` for pagination. Do NOT use `filter[since]`/`filter[until]` for pagination purposes - they are for date range filtering only.

### Fetching All Pages

To retrieve all records, follow `links.next` until it is `null`.

> **PiggyBack implementation note:** The `getAllPages()` method in `src/lib/up-api.ts` includes a `MAX_PAGES = 100` safety limit to prevent infinite loops. If pagination reaches this limit, a warning is logged and remaining pages are skipped.

```typescript
async function getAllPages<T>(initialResponse: PaginatedResponse<T>, token: string): Promise<T[]> {
  let allData = [...initialResponse.data];
  let nextUrl = initialResponse.links.next;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const page = await response.json();
    allData.push(...page.data);
    nextUrl = page.links.next;
  }

  return allData;
}
```

## Error Handling

### Error Response Format

All errors follow JSON:API error format:

```json
{
  "errors": [{
    "status": "404",
    "title": "Not Found",
    "detail": "The category identifier 'invalid-id' could not be found.",
    "source": {
      "parameter": "filter[category]"
    }
  }]
}
```

### Error Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | HTTP status code |
| `title` | string | Short error title |
| `detail` | string | Human-readable explanation |
| `source.parameter` | string | Query parameter that caused the error |
| `source.pointer` | string | JSON pointer to the field in the request body |

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `204` | Success (no content, e.g., PATCH/DELETE) |
| `400` | Bad request (invalid parameters) |
| `401` | Unauthorized (invalid/missing token) |
| `404` | Resource not found |
| `422` | Unprocessable entity (validation error) |
| `429` | Rate limited |

## Data Types Reference

### MoneyObject

```typescript
{
  currencyCode: string;   // ISO 4217 (e.g., "AUD")
  value: string;          // Human-readable (e.g., "-45.67")
  valueInBaseUnits: number; // Cents as 64-bit integer (e.g., -4567)
}
```

### Enums

**TransactionStatusEnum:** `"HELD"` | `"SETTLED"`

**AccountTypeEnum:** `"SAVER"` | `"TRANSACTIONAL"` | `"HOME_LOAN"`

**OwnershipTypeEnum:** `"INDIVIDUAL"` | `"JOINT"`

**CardPurchaseMethodEnum:** `"BAR_CODE"` | `"OCR"` | `"CARD_PIN"` | `"CARD_DETAILS"` | `"CARD_ON_FILE"` | `"ECOMMERCE"` | `"MAGNETIC_STRIPE"` | `"CONTACTLESS"`

**WebhookEventTypeEnum:** `"PING"` | `"TRANSACTION_CREATED"` | `"TRANSACTION_SETTLED"` | `"TRANSACTION_DELETED"`

**WebhookDeliveryStatusEnum:** `"DELIVERED"` | `"UNDELIVERABLE"` | `"BAD_RESPONSE_CODE"`
