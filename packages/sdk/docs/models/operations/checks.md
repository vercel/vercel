# Checks

## Example Usage

```typescript
import { Checks } from "@vercel/sdk/models/operations";

let value: Checks = {
  createdAt: 6130.64,
  id: "<id>",
  integrationId: "<value>",
  name: "<value>",
  rerequestable: false,
  status: "running",
  updatedAt: 9023.49,
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