# Tags API

Tags are user-created labels that can be attached to transactions. Tags are identified by their label string (e.g., "Holiday", "Pizza Night").

## List Tags

```
GET /tags
```

Retrieve a paginated list of all tags currently in use, ordered lexicographically.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page[size]` | integer | Records per page |

### Response: `TagResource`

```json
{
  "data": [{
    "type": "tags",
    "id": "Holiday",
    "relationships": {
      "transactions": {
        "links": {
          "related": "https://api.up.com.au/api/v1/transactions?filter%5Btag%5D=Holiday"
        }
      }
    }
  }],
  "links": {
    "prev": null,
    "next": "https://api.up.com.au/api/v1/tags?page%5Bafter%5D=..."
  }
}
```

## Add Tags to Transaction

```
POST /transactions/{transactionId}/relationships/tags
```

### Request Body

```json
{
  "data": [
    { "type": "tags", "id": "Holiday" },
    { "type": "tags", "id": "Trip to Bali" }
  ]
}
```

### Response

`204 No Content` on success. If a tag does not yet exist, it will be created automatically.

## Remove Tags from Transaction

```
DELETE /transactions/{transactionId}/relationships/tags
```

### Request Body

```json
{
  "data": [
    { "type": "tags", "id": "Holiday" }
  ]
}
```

### Response

`204 No Content` on success. If a tag is removed from all transactions, it ceases to exist.
