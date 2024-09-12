# GitRepo3

## Example Usage

```typescript
import { GitRepo3 } from "@vercel/sdk/models/operations";

let value: GitRepo3 = {
  owner: "<value>",
  repoUuid: "<value>",
  slug: "<value>",
  type: "bitbucket",
  workspaceUuid: "<value>",
  path: "/var/tmp",
  defaultBranch: "<value>",
  name: "<value>",
  private: false,
  ownerType: "user",
};
```

## Fields

| Field                                                                                                                  | Type                                                                                                                   | Required                                                                                                               | Description                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `owner`                                                                                                                | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `repoUuid`                                                                                                             | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `slug`                                                                                                                 | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `type`                                                                                                                 | [operations.CreateDeploymentGitRepoDeploymentsType](../../models/operations/createdeploymentgitrepodeploymentstype.md) | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `workspaceUuid`                                                                                                        | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `path`                                                                                                                 | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `defaultBranch`                                                                                                        | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `name`                                                                                                                 | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `private`                                                                                                              | *boolean*                                                                                                              | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `ownerType`                                                                                                            | [operations.CreateDeploymentGitRepoOwnerType](../../models/operations/createdeploymentgitrepoownertype.md)             | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |