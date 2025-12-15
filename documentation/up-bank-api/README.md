# Up Bank API Reference

**Base URL:** `https://api.up.com.au/api/v1`
**Documentation:** https://developer.up.com.au/
**Authentication:** Bearer token (Personal Access Token)

Up is an Australian neobank. The API provides programmatic access to banking data including accounts, transactions, categories, tags, and webhooks.

## Authentication

All requests require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer up:yeah:xxxxxxxx
```

Personal Access Tokens can be generated at https://api.up.com.au/getting_started

## API Conventions

- **JSON:API format** - All responses follow the JSON:API specification
- **Pagination** - List endpoints return paginated results with `links.prev` and `links.next`
- **Date format** - All dates use RFC 3339 format (e.g., `2020-01-01T01:02:03+10:00`)
- **Money format** - Amounts include `currencyCode`, `value` (string), and `valueInBaseUnits` (integer cents)

## Endpoints Overview

| Resource | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| **Utility** | GET | `/util/ping` | Verify token validity |
| **Accounts** | GET | `/accounts` | List all accounts |
| **Accounts** | GET | `/accounts/{id}` | Retrieve single account |
| **Transactions** | GET | `/transactions` | List all transactions |
| **Transactions** | GET | `/transactions/{id}` | Retrieve single transaction |
| **Transactions** | GET | `/accounts/{accountId}/transactions` | List transactions by account |
| **Categories** | GET | `/categories` | List all categories |
| **Categories** | GET | `/categories/{id}` | Retrieve single category |
| **Categories** | PATCH | `/transactions/{id}/relationships/category` | Categorize a transaction |
| **Tags** | GET | `/tags` | List all tags |
| **Tags** | POST | `/transactions/{id}/relationships/tags` | Add tags to transaction |
| **Tags** | DELETE | `/transactions/{id}/relationships/tags` | Remove tags from transaction |
| **Attachments** | GET | `/attachments` | List attachments |
| **Attachments** | GET | `/attachments/{id}` | Retrieve single attachment |
| **Webhooks** | GET | `/webhooks` | List webhooks |
| **Webhooks** | POST | `/webhooks` | Create webhook |
| **Webhooks** | GET | `/webhooks/{id}` | Retrieve single webhook |
| **Webhooks** | DELETE | `/webhooks/{id}` | Delete webhook |
| **Webhooks** | POST | `/webhooks/{id}/ping` | Ping webhook |
| **Webhooks** | GET | `/webhooks/{id}/logs` | List webhook delivery logs |
