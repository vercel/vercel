# GitRepo2

## Example Usage

```typescript
import { GitRepo2 } from '@vercel/client/models/operations';

let value: GitRepo2 = {
  org: '<value>',
  repo: '<value>',
  repoId: 6216.93,
  type: 'github',
  repoOwnerId: '<value>',
  path: '/proc',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'team',
};
```

## Fields

| Field           | Type                                                                                             | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `org`           | _string_                                                                                         | :heavy_check_mark: | N/A         |
| `repo`          | _string_                                                                                         | :heavy_check_mark: | N/A         |
| `repoId`        | _number_                                                                                         | :heavy_check_mark: | N/A         |
| `type`          | [operations.CreateDeploymentGitRepoType](../../models/operations/createdeploymentgitrepotype.md) | :heavy_check_mark: | N/A         |
| `repoOwnerId`   | _string_                                                                                         | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                         | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                         | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                         | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                        | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.GitRepoOwnerType](../../models/operations/gitrepoownertype.md)                       | :heavy_check_mark: | N/A         |
