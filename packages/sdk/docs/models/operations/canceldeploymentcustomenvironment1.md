# CancelDeploymentCustomEnvironment1

## Example Usage

```typescript
import { CancelDeploymentCustomEnvironment1 } from "@vercel/sdk/models/operations/canceldeployment.js";

let value: CancelDeploymentCustomEnvironment1 = {
  id: "<id>",
  name: "<value>",
  slug: "<value>",
  type: "production",
  createdAt: 2987.50,
  updatedAt: 2550.64,
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                 | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `name`                                                                                                               | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `slug`                                                                                                               | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `type`                                                                                                               | [operations.CancelDeploymentCustomEnvironmentType](../../models/operations/canceldeploymentcustomenvironmenttype.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `description`                                                                                                        | *string*                                                                                                             | :heavy_minus_sign:                                                                                                   | N/A                                                                                                                  |
| `branchMatcher`                                                                                                      | [operations.CustomEnvironmentBranchMatcher](../../models/operations/customenvironmentbranchmatcher.md)               | :heavy_minus_sign:                                                                                                   | N/A                                                                                                                  |
| `createdAt`                                                                                                          | *number*                                                                                                             | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `updatedAt`                                                                                                          | *number*                                                                                                             | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `domains`                                                                                                            | [operations.CustomEnvironmentDomains](../../models/operations/customenvironmentdomains.md)[]                         | :heavy_minus_sign:                                                                                                   | N/A                                                                                                                  |