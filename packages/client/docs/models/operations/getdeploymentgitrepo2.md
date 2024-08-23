# GetDeploymentGitRepo2

## Example Usage

```typescript
import { GetDeploymentGitRepo2 } from '@vercel/client/models/operations';

let value: GetDeploymentGitRepo2 = {
  org: '<value>',
  repo: '<value>',
  repoId: 3295.43,
  type: 'github',
  repoOwnerId: '<value>',
  path: '/var/log',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'user',
};
```

## Fields

| Field           | Type                                                                                                                                       | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `org`           | _string_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `repo`          | _string_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `repoId`        | _number_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `type`          | [operations.GetDeploymentGitRepoType](../../models/operations/getdeploymentgitrepotype.md)                                                 | :heavy_check_mark: | N/A         |
| `repoOwnerId`   | _string_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                                                                  | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.GetDeploymentGitRepoDeploymentsResponseOwnerType](../../models/operations/getdeploymentgitrepodeploymentsresponseownertype.md) | :heavy_check_mark: | N/A         |
