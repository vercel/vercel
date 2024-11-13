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
      type: "HTTPS",
      value: "<value>",
      creator: "<value>",
      created: 455.11,
      updated: 1979.83,
      createdAt: 4047.74,
      updatedAt: 6012.77,
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
      type: "SRV",
      value: "<value>",
      creator: "<value>",
      created: 4130.86,
      updated: 7100.58,
      createdAt: 7898.70,
      updatedAt: 3172.60,
    },
  ],
  pagination: {
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

