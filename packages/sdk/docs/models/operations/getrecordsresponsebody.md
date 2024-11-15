# GetRecordsResponseBody

Successful response retrieving a list of paginated DNS records.


## Supported Types

### `string`

```typescript
const value: string = "<value>";
```

### `operations.GetRecordsResponseBody2`

```typescript
const value: operations.GetRecordsResponseBody2 = {
  records: [
    {
      id: "<id>",
      slug: "<value>",
      name: "<value>",
      type: "MX",
      value: "<value>",
      creator: "<value>",
      created: 7719.31,
      updated: 4130.86,
      createdAt: 7100.58,
      updatedAt: 7898.70,
    },
  ],
};
```

### `operations.ResponseBody3`

```typescript
const value: operations.ResponseBody3 = {
  records: [
    {
      id: "<id>",
      slug: "<value>",
      name: "<value>",
      type: "CAA",
      value: "<value>",
      creator: "<value>",
      created: 9792.70,
      updated: 6496.56,
      createdAt: 8809.98,
      updatedAt: 5559.38,
    },
  ],
  pagination: {
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

