# Accounts API

## List Accounts

```
GET /accounts
```

Retrieve a paginated list of all accounts for the authenticated user. Results are ordered by creation date.

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page[size]` | integer | Records per page | `?page[size]=30` |
| `filter[accountType]` | string | Filter by account type | `?filter[accountType]=SAVER` |
| `filter[ownershipType]` | string | Filter by ownership | `?filter[ownershipType]=INDIVIDUAL` |

### Account Types (`AccountTypeEnum`)

- `SAVER` - Savings account (Up savers)
- `TRANSACTIONAL` - Spending account
- `HOME_LOAN` - Home loan account

### Ownership Types (`OwnershipTypeEnum`)

- `INDIVIDUAL` - Single owner
- `JOINT` - Shared account (2Up)

### Response: `AccountResource`

```json
{
  "data": [{
    "type": "accounts",
    "id": "4bedbcc7-3cf6-44a4-92bc-cbed4bd65d87",
    "attributes": {
      "displayName": "Spending",
      "accountType": "TRANSACTIONAL",
      "ownershipType": "INDIVIDUAL",
      "balance": {
        "currencyCode": "AUD",
        "value": "1234.56",
        "valueInBaseUnits": 123456
      },
      "createdAt": "2020-01-01T01:02:03+10:00"
    },
    "relationships": {
      "transactions": {
        "links": {
          "related": "https://api.up.com.au/api/v1/accounts/4bedbcc7-.../transactions"
        }
      }
    },
    "links": {
      "self": "https://api.up.com.au/api/v1/accounts/4bedbcc7-..."
    }
  }],
  "links": {
    "prev": null,
    "next": "https://api.up.com.au/api/v1/accounts?page[after]=..."
  }
}
```

## Retrieve Account

```
GET /accounts/{id}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | Account unique identifier |

### Response

Returns a single `AccountResource` wrapped in `{ data: AccountResource }`.

## MoneyObject

All monetary values use this structure:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `currencyCode` | string | ISO 4217 code | `"AUD"` |
| `value` | string | Human-readable amount | `"10.56"` |
| `valueInBaseUnits` | integer | Amount in cents (64-bit) | `1056` |
