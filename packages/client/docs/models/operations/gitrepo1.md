# GitRepo1

## Example Usage

```typescript
import { GitRepo1 } from '@vercel/client/models/operations';

let value: GitRepo1 = {
  namespace: '<value>',
  projectId: 5421.29,
  type: 'gitlab',
  url: 'https://clear-cut-transfer.net',
  path: '/usr/obj',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'team',
};
```

## Fields

| Field           | Type                                                                                                                             | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `namespace`     | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `projectId`     | _number_                                                                                                                         | :heavy_check_mark: | N/A         |
| `type`          | [operations.GitRepoType](../../models/operations/gitrepotype.md)                                                                 | :heavy_check_mark: | N/A         |
| `url`           | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                                                        | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.CreateDeploymentGitRepoDeploymentsOwnerType](../../models/operations/createdeploymentgitrepodeploymentsownertype.md) | :heavy_check_mark: | N/A         |
