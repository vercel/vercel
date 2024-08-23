# GitRepo3

## Example Usage

```typescript
import { GitRepo3 } from '@vercel/client/models/operations';

let value: GitRepo3 = {
  owner: '<value>',
  repoUuid: '<value>',
  slug: '<value>',
  type: 'bitbucket',
  workspaceUuid: '<value>',
  path: '/var/tmp',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'user',
};
```

## Fields

| Field           | Type                                                                                                                   | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `owner`         | _string_                                                                                                               | :heavy_check_mark: | N/A         |
| `repoUuid`      | _string_                                                                                                               | :heavy_check_mark: | N/A         |
| `slug`          | _string_                                                                                                               | :heavy_check_mark: | N/A         |
| `type`          | [operations.CreateDeploymentGitRepoDeploymentsType](../../models/operations/createdeploymentgitrepodeploymentstype.md) | :heavy_check_mark: | N/A         |
| `workspaceUuid` | _string_                                                                                                               | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                                               | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                                               | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                               | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                                              | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.CreateDeploymentGitRepoOwnerType](../../models/operations/createdeploymentgitrepoownertype.md)             | :heavy_check_mark: | N/A         |
