# GetProjectsLink2

## Example Usage

```typescript
import { GetProjectsLink2 } from "@vercel/sdk/models/operations";

let value: GetProjectsLink2 = {
  deployHooks: [
    {
      id: "<id>",
      name: "<value>",
      ref: "<value>",
      url: "https://ornery-antechamber.net",
    },
  ],
};
```

## Fields

| Field                                                                                                            | Type                                                                                                             | Required                                                                                                         | Description                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `projectId`                                                                                                      | *string*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `projectName`                                                                                                    | *string*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `projectNameWithNamespace`                                                                                       | *string*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `projectNamespace`                                                                                               | *string*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `projectUrl`                                                                                                     | *string*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `type`                                                                                                           | [operations.GetProjectsLinkProjectsType](../../models/operations/getprojectslinkprojectstype.md)                 | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `createdAt`                                                                                                      | *number*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `deployHooks`                                                                                                    | [operations.GetProjectsLinkProjectsDeployHooks](../../models/operations/getprojectslinkprojectsdeployhooks.md)[] | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `gitCredentialId`                                                                                                | *string*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `updatedAt`                                                                                                      | *number*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `sourceless`                                                                                                     | *boolean*                                                                                                        | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `productionBranch`                                                                                               | *string*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |