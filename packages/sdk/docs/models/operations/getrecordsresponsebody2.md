# GetRecordsResponseBody2

## Example Usage

```typescript
import { GetRecordsResponseBody2 } from "@vercel/sdk/models/operations";

let value: GetRecordsResponseBody2 = {
  records: [
    {
      id: "<id>",
      slug: "<value>",
      name: "<value>",
      type: "ALIAS",
      value: "<value>",
      creator: "<value>",
      created: 4706.21,
      updated: 4731.9,
      createdAt: 1158.34,
      updatedAt: 4797.54,
    },
  ],
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `records`                                                  | [operations.Records](../../models/operations/records.md)[] | :heavy_check_mark:                                         | N/A                                                        |