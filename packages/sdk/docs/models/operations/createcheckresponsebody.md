# CreateCheckResponseBody

## Example Usage

```typescript
import { CreateCheckResponseBody } from "@vercel/sdk/models/operations/createcheck.js";

let value: CreateCheckResponseBody = {
  id: "<id>",
  name: "<value>",
  status: "completed",
  blocking: false,
  integrationId: "<id>",
  deploymentId: "<id>",
  createdAt: 391.88,
  updatedAt: 2828.07,
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `id`                                                                                 | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `name`                                                                               | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `path`                                                                               | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `status`                                                                             | [operations.CreateCheckStatus](../../models/operations/createcheckstatus.md)         | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `conclusion`                                                                         | [operations.CreateCheckConclusion](../../models/operations/createcheckconclusion.md) | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `blocking`                                                                           | *boolean*                                                                            | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `output`                                                                             | [operations.CreateCheckOutput](../../models/operations/createcheckoutput.md)         | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `detailsUrl`                                                                         | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `integrationId`                                                                      | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `deploymentId`                                                                       | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `externalId`                                                                         | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `createdAt`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `updatedAt`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `startedAt`                                                                          | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `completedAt`                                                                        | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `rerequestable`                                                                      | *boolean*                                                                            | :heavy_minus_sign:                                                                   | N/A                                                                                  |