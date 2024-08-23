# GetDeploymentGitRepo1

## Example Usage

```typescript
import { GetDeploymentGitRepo1 } from '@vercel/client/models/operations';

let value: GetDeploymentGitRepo1 = {
  namespace: '<value>',
  projectId: 1685.76,
  type: 'gitlab',
  url: 'http://unsightly-dessert.biz',
  path: '/opt/share',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'user',
};
```

## Fields

| Field           | Type                                                                                                                             | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `namespace`     | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `projectId`     | _number_                                                                                                                         | :heavy_check_mark: | N/A         |
| `type`          | [operations.GetDeploymentGitRepoDeploymentsResponseType](../../models/operations/getdeploymentgitrepodeploymentsresponsetype.md) | :heavy_check_mark: | N/A         |
| `url`           | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                         | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                                                        | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.GetDeploymentGitRepoDeploymentsOwnerType](../../models/operations/getdeploymentgitrepodeploymentsownertype.md)       | :heavy_check_mark: | N/A         |
