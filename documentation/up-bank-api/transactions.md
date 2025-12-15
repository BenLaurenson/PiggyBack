# Transactions API

## List Transactions

```
GET /transactions
```

Retrieve a paginated list of all transactions across all accounts. Results ordered newest first.

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page[size]` | integer | Records per page | `?page[size]=30` |
| `filter[status]` | string | Filter by status | `?filter[status]=SETTLED` |
| `filter[since]` | string (RFC 3339) | Start date-time | `?filter[since]=2020-01-01T01:02:03+10:00` |
| `filter[until]` | string (RFC 3339) | End date-time | `?filter[until]=2020-02-01T01:02:03+10:00` |
| `filter[category]` | string | Category ID filter | `?filter[category]=good-life` |
| `filter[tag]` | string | Tag filter | `?filter[tag]=Holiday` |

**Note:** `filter[since]` and `filter[until]` should NOT be used for pagination. Use `links.next`/`links.prev` instead.

### Transaction Status (`TransactionStatusEnum`)

- `HELD` - Transaction is pending/held
- `SETTLED` - Transaction has been processed

## List Transactions by Account

```
GET /accounts/{accountId}/transactions
```

Same query parameters as above, scoped to a single account.

## Retrieve Transaction

```
GET /transactions/{id}
```

## Response: `TransactionResource`

```json
{
  "data": {
    "type": "transactions",
    "id": "ba763685-fd3d-4307-bf7a-1a0da2c5f3a7",
    "attributes": {
      "status": "SETTLED",
      "rawText": "WOOLWORTHS 1234 SYDNEY",
      "description": "Woolworths",
      "message": null,
      "isCategorizable": true,
      "holdInfo": null,
      "roundUp": null,
      "cashback": null,
      "amount": {
        "currencyCode": "AUD",
        "value": "-45.67",
        "valueInBaseUnits": -4567
      },
      "foreignAmount": null,
      "cardPurchaseMethod": {
        "method": "CONTACTLESS",
        "cardNumberSuffix": "1234"
      },
      "settledAt": "2020-01-02T01:02:03+10:00",
      "createdAt": "2020-01-01T01:02:03+10:00",
      "performingCustomer": {
        "displayName": "Ben"
      }
    },
    "relationships": {
      "account": {
        "data": { "type": "accounts", "id": "..." },
        "links": { "related": "..." }
      },
      "transferAccount": {
        "data": null,
        "links": { "related": "..." }
      },
      "category": {
        "data": { "type": "categories", "id": "groceries" },
        "links": {
          "self": "https://api.up.com.au/api/v1/transactions/.../relationships/category",
          "related": "https://api.up.com.au/api/v1/categories/groceries"
        }
      },
      "parentCategory": {
        "data": { "type": "categories", "id": "home" },
        "links": { "related": "..." }
      },
      "tags": {
        "data": [{ "type": "tags", "id": "Holiday" }],
        "links": { "self": "..." }
      }
    },
    "links": {
      "self": "https://api.up.com.au/api/v1/transactions/..."
    }
  }
}
```

## Transaction Attributes Detail

### `holdInfo` (nullable)

Present when transaction is or was `HELD`. Contains the held amount which may differ from final settled amount.

```json
{
  "amount": { "currencyCode": "AUD", "value": "45.00", "valueInBaseUnits": 4500 },
  "foreignAmount": null
}
```

### `roundUp` (nullable)

Present if round-ups are enabled. Shows the round-up amount and boost portion.

```json
{
  "amount": { "currencyCode": "AUD", "value": "0.33", "valueInBaseUnits": 33 },
  "boostPortion": null
}
```

### `cashback` (nullable)

Present if the transaction includes a cashback reward.

```json
{
  "description": "Cashback reward",
  "amount": { "currencyCode": "AUD", "value": "5.00", "valueInBaseUnits": 500 }
}
```

### `cardPurchaseMethod` (nullable)

Present for card purchases. Method enum values:

- `BAR_CODE`
- `OCR`
- `CARD_PIN`
- `CARD_DETAILS`
- `CARD_ON_FILE`
- `ECOMMERCE`
- `MAGNETIC_STRIPE`
- `CONTACTLESS`

### `performingCustomer` (optional)

For 2Up (joint) accounts, identifies which partner made the transaction.

```json
{
  "displayName": "Ben"
}
```

## Categorize Transaction

```
PATCH /transactions/{transactionId}/relationships/category
```

### Request Body

Set a category:
```json
{
  "data": { "type": "categories", "id": "groceries" }
}
```

Remove a category:
```json
{
  "data": null
}
```

### Response

`204 No Content` on success.
