# CancelDeploymentGitRepo1

## Example Usage

```typescript
import { CancelDeploymentGitRepo1 } from "@vercel/sdk/models/operations/canceldeployment.js";

let value: CancelDeploymentGitRepo1 = {
  namespace: "<value>",
  projectId: 5147.67,
  type: "gitlab",
  url: "https://scientific-sonar.com/",
  path: "/media",
  defaultBranch: "<value>",
  name: "<value>",
  private: false,
  ownerType: "team",
};
```

## Fields

| Field                                                                                                      | Type                                                                                                       | Required                                                                                                   | Description                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `namespace`                                                                                                | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `projectId`                                                                                                | *number*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `type`                                                                                                     | [operations.CancelDeploymentGitRepoType](../../models/operations/canceldeploymentgitrepotype.md)           | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `url`                                                                                                      | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `path`                                                                                                     | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `defaultBranch`                                                                                            | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `name`                                                                                                     | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `private`                                                                                                  | *boolean*                                                                                                  | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `ownerType`                                                                                                | [operations.CancelDeploymentGitRepoOwnerType](../../models/operations/canceldeploymentgitrepoownertype.md) | :heavy_check_mark:                                                                                         | N/A                                                                                                        |