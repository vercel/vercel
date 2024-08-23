# CancelDeploymentGitSource3

## Example Usage

```typescript
import { CancelDeploymentGitSource3 } from '@vercel/client/models/operations';

let value: CancelDeploymentGitSource3 = {
  type: 'gitlab',
  projectId: 1875.52,
};
```

## Fields

| Field       | Type                                                                                                                                       | Required           | Description |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `type`      | [operations.CancelDeploymentGitSourceDeploymentsResponseType](../../models/operations/canceldeploymentgitsourcedeploymentsresponsetype.md) | :heavy_check_mark: | N/A         |
| `projectId` | _operations.CancelDeploymentGitSourceProjectId_                                                                                            | :heavy_check_mark: | N/A         |
| `ref`       | _string_                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `sha`       | _string_                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `prId`      | _number_                                                                                                                                   | :heavy_minus_sign: | N/A         |
