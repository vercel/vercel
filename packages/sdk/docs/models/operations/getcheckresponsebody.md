# GetCheckResponseBody

## Example Usage

```typescript
import { GetCheckResponseBody } from "@vercel/sdk/models/operations";

let value: GetCheckResponseBody = {
  id: "<id>",
  name: "<value>",
  status: "running",
  blocking: false,
  integrationId: "<value>",
  deploymentId: "<value>",
  createdAt: 3250.47,
  updatedAt: 5701.97,
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `id`                                                                           | *string*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `name`                                                                         | *string*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `path`                                                                         | *string*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |
| `status`                                                                       | [operations.GetCheckStatus](../../models/operations/getcheckstatus.md)         | :heavy_check_mark:                                                             | N/A                                                                            |
| `conclusion`                                                                   | [operations.GetCheckConclusion](../../models/operations/getcheckconclusion.md) | :heavy_minus_sign:                                                             | N/A                                                                            |
| `blocking`                                                                     | *boolean*                                                                      | :heavy_check_mark:                                                             | N/A                                                                            |
| `output`                                                                       | [operations.GetCheckOutput](../../models/operations/getcheckoutput.md)         | :heavy_minus_sign:                                                             | N/A                                                                            |
| `detailsUrl`                                                                   | *string*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |
| `integrationId`                                                                | *string*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `deploymentId`                                                                 | *string*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `externalId`                                                                   | *string*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |
| `createdAt`                                                                    | *number*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `updatedAt`                                                                    | *number*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `startedAt`                                                                    | *number*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |
| `completedAt`                                                                  | *number*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |
| `rerequestable`                                                                | *boolean*                                                                      | :heavy_minus_sign:                                                             | N/A                                                                            |