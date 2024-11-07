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
      type: "SRV",
      value: "<value>",
      creator: "<value>",
      created: 3172.60,
      updated: 9792.70,
      createdAt: 6496.56,
      updatedAt: 8809.98,
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
      type: "HTTPS",
      value: "<value>",
      creator: "<value>",
      created: 7416.03,
      updated: 7705.44,
      createdAt: 9082.48,
      updatedAt: 1503.50,
    },
  ],
  pagination: {
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

