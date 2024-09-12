# GitRepo1

## Example Usage

```typescript
import { GitRepo1 } from "@vercel/sdk/models/operations";

let value: GitRepo1 = {
  namespace: "<value>",
  projectId: 5421.29,
  type: "gitlab",
  url: "https://clear-cut-transfer.net",
  path: "/usr/obj",
  defaultBranch: "<value>",
  name: "<value>",
  private: false,
  ownerType: "team",
};
```

## Fields

| Field                                                                                                                            | Type                                                                                                                             | Required                                                                                                                         | Description                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `namespace`                                                                                                                      | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `projectId`                                                                                                                      | *number*                                                                                                                         | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `type`                                                                                                                           | [operations.GitRepoType](../../models/operations/gitrepotype.md)                                                                 | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `url`                                                                                                                            | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `path`                                                                                                                           | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `defaultBranch`                                                                                                                  | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `name`                                                                                                                           | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `private`                                                                                                                        | *boolean*                                                                                                                        | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `ownerType`                                                                                                                      | [operations.CreateDeploymentGitRepoDeploymentsOwnerType](../../models/operations/createdeploymentgitrepodeploymentsownertype.md) | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |