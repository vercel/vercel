# GetRecordsResponseBody2

## Example Usage

```typescript
import { GetRecordsResponseBody2 } from "@vercel/sdk/models/operations/getrecords.js";

let value: GetRecordsResponseBody2 = {
  records: [
    {
      id: "<id>",
      slug: "<value>",
      name: "<value>",
      type: "CAA",
      value: "<value>",
      creator: "<value>",
      created: 9003.67,
      updated: 9832.75,
      createdAt: 304.27,
      updatedAt: 1936.23,
    },
  ],
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `records`                                                  | [operations.Records](../../models/operations/records.md)[] | :heavy_check_mark:                                         | N/A                                                        |