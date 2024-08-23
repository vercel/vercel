# GetDeploymentGitSourceDeployments4

## Example Usage

```typescript
import { GetDeploymentGitSourceDeployments4 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSourceDeployments4 = {
  type: 'bitbucket',
  repoUuid: '<value>',
};
```

## Fields

| Field           | Type                                                                                                                                 | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `type`          | [operations.GetDeploymentGitSourceDeploymentsResponseType](../../models/operations/getdeploymentgitsourcedeploymentsresponsetype.md) | :heavy_check_mark: | N/A         |
| `workspaceUuid` | _string_                                                                                                                             | :heavy_minus_sign: | N/A         |
| `repoUuid`      | _string_                                                                                                                             | :heavy_check_mark: | N/A         |
| `ref`           | _string_                                                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`           | _string_                                                                                                                             | :heavy_minus_sign: | N/A         |
| `prId`          | _number_                                                                                                                             | :heavy_minus_sign: | N/A         |
