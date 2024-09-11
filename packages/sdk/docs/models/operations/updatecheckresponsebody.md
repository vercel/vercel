# UpdateCheckResponseBody

## Example Usage

```typescript
import { UpdateCheckResponseBody } from "@vercel/sdk/models/operations";

let value: UpdateCheckResponseBody = {
  id: "<id>",
  name: "<value>",
  status: "registered",
  blocking: false,
  integrationId: "<value>",
  deploymentId: "<value>",
  createdAt: 4143.69,
  updatedAt: 4663.11,
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `id`                                                                                 | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `name`                                                                               | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `path`                                                                               | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `status`                                                                             | [operations.UpdateCheckStatus](../../models/operations/updatecheckstatus.md)         | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `conclusion`                                                                         | [operations.UpdateCheckConclusion](../../models/operations/updatecheckconclusion.md) | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `blocking`                                                                           | *boolean*                                                                            | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `output`                                                                             | [operations.UpdateCheckOutput](../../models/operations/updatecheckoutput.md)         | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `detailsUrl`                                                                         | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `integrationId`                                                                      | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `deploymentId`                                                                       | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `externalId`                                                                         | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `createdAt`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `updatedAt`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `startedAt`                                                                          | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `completedAt`                                                                        | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `rerequestable`                                                                      | *boolean*                                                                            | :heavy_minus_sign:                                                                   | N/A                                                                                  |