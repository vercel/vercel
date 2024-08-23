# GetDeploymentGitSourceDeployments3

## Example Usage

```typescript
import { GetDeploymentGitSourceDeployments3 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSourceDeployments3 = {
  type: 'gitlab',
  projectId: '<value>',
};
```

## Fields

| Field       | Type                                                                                                                 | Required           | Description |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`      | [operations.GetDeploymentGitSourceDeploymentsType](../../models/operations/getdeploymentgitsourcedeploymentstype.md) | :heavy_check_mark: | N/A         |
| `projectId` | _operations.GetDeploymentGitSourceProjectId_                                                                         | :heavy_check_mark: | N/A         |
| `ref`       | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`       | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `prId`      | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
