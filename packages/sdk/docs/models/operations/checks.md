# Checks

## Example Usage

```typescript
import { Checks } from "@vercel/sdk/models/operations/getallchecks.js";

let value: Checks = {
  createdAt: 5759.46,
  id: "<id>",
  integrationId: "<id>",
  name: "<value>",
  rerequestable: false,
  status: "completed",
  updatedAt: 3185.69,
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `completedAt`                                                                          | *number*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `conclusion`                                                                           | [operations.GetAllChecksConclusion](../../models/operations/getallchecksconclusion.md) | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `createdAt`                                                                            | *number*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `detailsUrl`                                                                           | *string*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `id`                                                                                   | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `integrationId`                                                                        | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `name`                                                                                 | *string*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `output`                                                                               | [operations.GetAllChecksOutput](../../models/operations/getallchecksoutput.md)         | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `path`                                                                                 | *string*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `rerequestable`                                                                        | *boolean*                                                                              | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `startedAt`                                                                            | *number*                                                                               | :heavy_minus_sign:                                                                     | N/A                                                                                    |
| `status`                                                                               | [operations.GetAllChecksStatus](../../models/operations/getallchecksstatus.md)         | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `updatedAt`                                                                            | *number*                                                                               | :heavy_check_mark:                                                                     | N/A                                                                                    |