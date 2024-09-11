# Link2

## Example Usage

```typescript
import { Link2 } from "@vercel/sdk/models/operations";

let value: Link2 = {
  deployHooks: [
    {
      id: "<id>",
      name: "<value>",
      ref: "<value>",
      url: "https://bony-trip.biz",
    },
  ],
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `projectId`                                                                                            | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `projectName`                                                                                          | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `projectNameWithNamespace`                                                                             | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `projectNamespace`                                                                                     | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `projectUrl`                                                                                           | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `type`                                                                                                 | [operations.UpdateProjectDataCacheLinkType](../../models/operations/updateprojectdatacachelinktype.md) | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `createdAt`                                                                                            | *number*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `deployHooks`                                                                                          | [operations.LinkDeployHooks](../../models/operations/linkdeployhooks.md)[]                             | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `gitCredentialId`                                                                                      | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `updatedAt`                                                                                            | *number*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `sourceless`                                                                                           | *boolean*                                                                                              | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `productionBranch`                                                                                     | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |