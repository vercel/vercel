# GitRepo2

## Example Usage

```typescript
import { GitRepo2 } from "@vercel/sdk/models/operations";

let value: GitRepo2 = {
  org: "<value>",
  repo: "<value>",
  repoId: 6216.93,
  type: "github",
  repoOwnerId: "<value>",
  path: "/proc",
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
| `repoOwnerId`                                                                                    | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `path`                                                                                           | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `defaultBranch`                                                                                  | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `name`                                                                                           | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `private`                                                                                        | *boolean*                                                                                        | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `ownerType`                                                                                      | [operations.GitRepoOwnerType](../../models/operations/gitrepoownertype.md)                       | :heavy_check_mark:                                                                               | N/A                                                                                              |