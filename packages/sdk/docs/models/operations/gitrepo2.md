# GitRepo2

## Example Usage

```typescript
import { GitRepo2 } from "@vercel/sdk/models/operations/createdeployment.js";

let value: GitRepo2 = {
  org: "<value>",
  repo: "<value>",
  repoId: 9824.45,
  type: "github",
  repoOwnerId: 4004.49,
  path: "/Users",
  defaultBranch: "<value>",
  name: "<value>",
  private: false,
  ownerType: "team",
};
```

## Fields

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `org`                                                                                            | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `repo`                                                                                           | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `repoId`                                                                                         | *number*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `type`                                                                                           | [operations.CreateDeploymentGitRepoType](../../models/operations/createdeploymentgitrepotype.md) | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `repoOwnerId`                                                                                    | *number*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `path`                                                                                           | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `defaultBranch`                                                                                  | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `name`                                                                                           | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `private`                                                                                        | *boolean*                                                                                        | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `ownerType`                                                                                      | [operations.GitRepoOwnerType](../../models/operations/gitrepoownertype.md)                       | :heavy_check_mark:                                                                               | N/A                                                                                              |