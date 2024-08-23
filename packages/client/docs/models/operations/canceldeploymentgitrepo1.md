# CancelDeploymentGitRepo1

## Example Usage

```typescript
import { CancelDeploymentGitRepo1 } from '@vercel/client/models/operations';

let value: CancelDeploymentGitRepo1 = {
  namespace: '<value>',
  projectId: 8906.53,
  type: 'gitlab',
  url: 'https://infamous-fridge.org',
  path: '/private',
  defaultBranch: '<value>',
  name: '<value>',
  private: false,
  ownerType: 'user',
};
```

## Fields

| Field           | Type                                                                                                       | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `namespace`     | _string_                                                                                                   | :heavy_check_mark: | N/A         |
| `projectId`     | _number_                                                                                                   | :heavy_check_mark: | N/A         |
| `type`          | [operations.CancelDeploymentGitRepoType](../../models/operations/canceldeploymentgitrepotype.md)           | :heavy_check_mark: | N/A         |
| `url`           | _string_                                                                                                   | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                                                   | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                                   | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                   | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                                  | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.CancelDeploymentGitRepoOwnerType](../../models/operations/canceldeploymentgitrepoownertype.md) | :heavy_check_mark: | N/A         |
