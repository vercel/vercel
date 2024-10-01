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
      created: 342.67,
      updated: 9985.27,
      createdAt: 1315.76,
      updatedAt: 7403.47,
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
      type: "TXT",
      value: "<value>",
      creator: "<value>",
      created: 3730.55,
      updated: 1968.52,
      createdAt: 987.60,
      updatedAt: 7486.06,
    },
  ],
  pagination: {
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

