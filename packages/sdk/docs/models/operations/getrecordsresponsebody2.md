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
      type: "CNAME",
      value: "<value>",
      creator: "<value>",
      created: 6012.77,
      updated: 7719.31,
      createdAt: 4130.86,
      updatedAt: 7100.58,
    },
  ],
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `records`                                                  | [operations.Records](../../models/operations/records.md)[] | :heavy_check_mark:                                         | N/A                                                        |