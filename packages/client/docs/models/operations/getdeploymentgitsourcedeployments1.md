# GetDeploymentGitSourceDeployments1

## Example Usage

```typescript
import { GetDeploymentGitSourceDeployments1 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSourceDeployments1 = {
  type: 'github',
  repoId: 2155.29,
};
```

## Fields

| Field    | Type                                                                                                                                                                                                 | Required           | Description |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`   | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody11Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody11type.md) | :heavy_check_mark: | N/A         |
| `repoId` | _operations.GetDeploymentGitSourceRepoId_                                                                                                                                                            | :heavy_check_mark: | N/A         |
| `ref`    | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`    | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `prId`   | _number_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
