# Webhooks API

Webhooks allow real-time notifications when transactions occur. Up sends POST requests to your configured URL.

## List Webhooks

```
GET /webhooks
```

Returns a paginated list of configured webhooks, ordered oldest first.

### Response: `WebhookResource`

```json
{
  "data": [{
    "type": "webhooks",
    "id": "1bcf7477-a232-4bd7-ba38-80673cca9910",
    "attributes": {
      "url": "https://myapp.com/api/upbank/webhook",
      "description": "PiggyBack transaction sync",
      "secretKey": "webhook_secret_key_here"
    },
    "relationships": {
      "logs": {
        "links": {
          "related": "https://api.up.com.au/api/v1/webhooks/.../logs"
        }
      }
    }
  }]
}
```

## Create Webhook

```
POST /webhooks
```

### Request Body

```json
{
  "data": {
    "attributes": {
      "url": "https://myapp.com/api/upbank/webhook",
      "description": "PiggyBack transaction sync"
    }
  }
}
```

### Response

Returns the created `WebhookResource` including a `secretKey` for verifying webhook signatures. **The secret key is only returned on creation and cannot be retrieved again.**

## Delete Webhook

```
DELETE /webhooks/{id}
```

### Response

`204 No Content` on success.

## Ping Webhook

```
POST /webhooks/{webhookId}/ping
```

Sends a `PING` event to the webhook URL. Useful for testing.

## List Webhook Logs

```
GET /webhooks/{webhookId}/logs
```

Returns delivery logs for a webhook including request body, response, and delivery status.

### Log Entry Structure

```json
{
  "type": "webhook-delivery-logs",
  "id": "8e95a0f0-...",
  "attributes": {
    "request": {
      "body": "{...webhook event JSON...}"
    },
    "response": {
      "statusCode": 200,
      "body": "{\"ok\":true}"
    },
    "deliveryStatus": "DELIVERED",
    "createdAt": "2025-06-03T00:22:51+10:00"
  },
  "relationships": {
    "webhookEvent": {
      "data": {
        "type": "webhook-events",
        "id": "26fa6493-..."
      }
    }
  }
}
```

### Delivery Status Values

- `DELIVERED` - Successfully delivered (200 response)
- `UNDELIVERABLE` - Failed after retries
- `BAD_RESPONSE_CODE` - Non-200 response received

## Webhook Event Types

### `PING`

Manually triggered via the ping endpoint. Used for testing.

### `TRANSACTION_CREATED`

Fired when a new transaction appears (usually `HELD` status initially).

**Includes:** `transaction` relationship with ID and link to full transaction.

### `TRANSACTION_SETTLED`

Fired when a transaction moves from `HELD` to `SETTLED` status.

**Includes:** `transaction` relationship with ID and link.

**Note:** In rare cases, this event may not fire. Instead, separate `TRANSACTION_DELETED` and `TRANSACTION_CREATED` events occur.

### `TRANSACTION_DELETED`

Fired when a `HELD` transaction is cancelled (e.g., hotel deposit returned).

**Includes:** Transaction ID only (no link, as the transaction no longer exists).

### Webhook Event Payload Structure

```json
{
  "data": {
    "type": "webhook-events",
    "id": "26fa6493-b4fe-4d6f-baa6-7bd72db1e8fc",
    "attributes": {
      "eventType": "TRANSACTION_CREATED",
      "createdAt": "2025-06-03T00:22:51+10:00"
    },
    "relationships": {
      "webhook": {
        "data": { "type": "webhooks", "id": "..." },
        "links": { "related": "..." }
      },
      "transaction": {
        "data": { "type": "transactions", "id": "ba763685-..." },
        "links": { "related": "https://api.up.com.au/api/v1/transactions/ba763685-..." }
      }
    }
  }
}
```

### Retry Behavior

For non-200 responses, unreachable URLs, or timeouts, Up retries with **exponential backoff**.
