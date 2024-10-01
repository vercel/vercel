# GetDeploymentGitRepo3

## Example Usage

```typescript
import { GetDeploymentGitRepo3 } from "@vercel/sdk/models/operations/getdeployment.js";

let value: GetDeploymentGitRepo3 = {
  owner: "<value>",
  repoUuid: "<id>",
  slug: "<value>",
  type: "bitbucket",
  workspaceUuid: "<id>",
  path: "/var/yp",
  defaultBranch: "<value>",
  name: "<value>",
  private: false,
  ownerType: "team",
};
```

## Fields

| Field                                                                                                            | Type                                                                                                             | Required                                                                                                         | Description                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `owner`                                                                                                          | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `repoUuid`                                                                                                       | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `slug`                                                                                                           | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `type`                                                                                                           | [operations.GetDeploymentGitRepoDeploymentsType](../../models/operations/getdeploymentgitrepodeploymentstype.md) | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `workspaceUuid`                                                                                                  | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `path`                                                                                                           | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `defaultBranch`                                                                                                  | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `name`                                                                                                           | *string*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `private`                                                                                                        | *boolean*                                                                                                        | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `ownerType`                                                                                                      | [operations.GetDeploymentGitRepoOwnerType](../../models/operations/getdeploymentgitrepoownertype.md)             | :heavy_check_mark:                                                                                               | N/A                                                                                                              |