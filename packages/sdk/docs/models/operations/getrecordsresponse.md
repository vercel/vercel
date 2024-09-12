# GetRecordsResponse

## Example Usage

```typescript
import { GetRecordsResponse } from "@vercel/sdk/models/operations";

let value: GetRecordsResponse = {
  result: {
    records: [
      {
        id: "<id>",
        slug: "<value>",
        name: "<value>",
        type: "A",
        value: "<value>",
        creator: "<value>",
        created: 1173.15,
        updated: 4837.06,
        createdAt: 2712.52,
        updatedAt: 4582.59,
      },
    ],
    pagination: {
      count: 20,
      next: 1540095775951,
      prev: 1540095775951,
    },
  },
};
```

## Fields

| Field                               | Type                                | Required                            | Description                         |
| ----------------------------------- | ----------------------------------- | ----------------------------------- | ----------------------------------- |
| `result`                            | *operations.GetRecordsResponseBody* | :heavy_check_mark:                  | N/A                                 |