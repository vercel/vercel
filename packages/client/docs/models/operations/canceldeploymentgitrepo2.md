# CancelDeploymentGitRepo2

## Example Usage

```typescript
import { CancelDeploymentGitRepo2 } from '@vercel/client/models/operations';

let value: CancelDeploymentGitRepo2 = {
  org: '<value>',
  repo: '<value>',
  repoId: 4032.18,
  type: 'github',
  repoOwnerId: '<value>',
  path: '/media',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'user',
};
```

## Fields

| Field           | Type                                                                                                                             | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `org`           | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `repo`          | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `repoId`        | _number_                                                                                                                         | :heavy_check_mark: | N/A         |
| `type`          | [operations.CancelDeploymentGitRepoDeploymentsType](../../models/operations/canceldeploymentgitrepodeploymentstype.md)           | :heavy_check_mark: | N/A         |
| `repoOwnerId`   | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                                                        | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.CancelDeploymentGitRepoDeploymentsOwnerType](../../models/operations/canceldeploymentgitrepodeploymentsownertype.md) | :heavy_check_mark: | N/A         |
