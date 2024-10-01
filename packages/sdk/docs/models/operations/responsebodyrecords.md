# ResponseBodyRecords

## Example Usage

```typescript
import { ResponseBodyRecords } from "@vercel/sdk/models/operations/getrecords.js";

let value: ResponseBodyRecords = {
  id: "<id>",
  slug: "<value>",
  name: "<value>",
  type: "CAA",
  value: "<value>",
  creator: "<value>",
  created: 685.97,
  updated: 2289.08,
  createdAt: 3579.84,
  updatedAt: 4351.42,
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                                                                                                 | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `slug`                                                                                               | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `name`                                                                                               | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `type`                                                                                               | [operations.GetRecordsResponseBodyDnsType](../../models/operations/getrecordsresponsebodydnstype.md) | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `value`                                                                                              | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `mxPriority`                                                                                         | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `priority`                                                                                           | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `creator`                                                                                            | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `created`                                                                                            | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `updated`                                                                                            | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `createdAt`                                                                                          | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `updatedAt`                                                                                          | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |