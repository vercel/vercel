# GetRecordsResponse

## Example Usage

```typescript
import { GetRecordsResponse } from "@vercel/sdk/models/operations/getrecords.js";

let value: GetRecordsResponse = {
  result: {
    records: [
      {
        id: "<id>",
        slug: "<value>",
        name: "<value>",
        type: "SRV",
        value: "<value>",
        creator: "<value>",
        created: 9154.08,
        updated: 1465.84,
        createdAt: 9191.71,
        updatedAt: 4116.26,
      },
    ],
  },
};
```

## Fields

| Field                               | Type                                | Required                            | Description                         |
| ----------------------------------- | ----------------------------------- | ----------------------------------- | ----------------------------------- |
| `result`                            | *operations.GetRecordsResponseBody* | :heavy_check_mark:                  | N/A                                 |