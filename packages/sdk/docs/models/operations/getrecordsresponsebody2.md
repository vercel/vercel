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
      type: "TXT",
      value: "<value>",
      creator: "<value>",
      created: 7203.19,
      updated: 9790.11,
      createdAt: 8988.25,
      updatedAt: 5867.17,
    },
  ],
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `records`                                                  | [operations.Records](../../models/operations/records.md)[] | :heavy_check_mark:                                         | N/A                                                        |