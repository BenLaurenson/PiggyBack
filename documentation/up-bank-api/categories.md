# Categories API

Up uses a two-level category hierarchy: parent categories contain child categories.

## List Categories

```
GET /categories
```

Returns all categories. **This endpoint is NOT paginated.**

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `filter[parent]` | string | Return only children of this parent | `?filter[parent]=good-life` |

### Response: `CategoryResource`

```json
{
  "data": [{
    "type": "categories",
    "id": "home",
    "attributes": {
      "name": "Home"
    },
    "relationships": {
      "parent": {
        "data": null
      },
      "children": {
        "data": [
          { "type": "categories", "id": "groceries" },
          { "type": "categories", "id": "home-maintenance" }
        ],
        "links": {
          "related": "https://api.up.com.au/api/v1/categories?filter%5Bparent%5D=home"
        }
      }
    },
    "links": {
      "self": "https://api.up.com.au/api/v1/categories/home"
    }
  }]
}
```

## Retrieve Category

```
GET /categories/{id}
```

Returns a single category by its human-readable ID (e.g., `groceries`, `good-life`).

## Category Hierarchy

Categories use human-readable, URL-safe IDs. Parent categories have `parent.data: null` and children in `children.data`. Child categories have their parent in `parent.data` and empty `children.data`.

### Known Parent Categories

These are the top-level categories in Up:

- `good-life` - Entertainment, hobbies, lifestyle
- `home` - Groceries, utilities, home maintenance
- `personal` - Health, education, personal care
- `transport` - Car, public transport, ride sharing
- `uncategorized` - Transactions not yet categorized

Each parent contains multiple child categories specific to that domain.
