# CancelDeploymentGitRepo3

## Example Usage

```typescript
import { CancelDeploymentGitRepo3 } from '@vercel/client/models/operations';

let value: CancelDeploymentGitRepo3 = {
  owner: '<value>',
  repoUuid: '<value>',
  slug: '<value>',
  type: 'bitbucket',
  workspaceUuid: '<value>',
  path: '/sys',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'team',
};
```

## Fields

| Field           | Type                                                                                                                                             | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `owner`         | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `repoUuid`      | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `slug`          | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `type`          | [operations.CancelDeploymentGitRepoDeploymentsResponseType](../../models/operations/canceldeploymentgitrepodeploymentsresponsetype.md)           | :heavy_check_mark: | N/A         |
| `workspaceUuid` | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                                                                        | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.CancelDeploymentGitRepoDeploymentsResponseOwnerType](../../models/operations/canceldeploymentgitrepodeploymentsresponseownertype.md) | :heavy_check_mark: | N/A         |
