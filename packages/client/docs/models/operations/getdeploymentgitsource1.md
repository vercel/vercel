# GetDeploymentGitSource1

## Example Usage

```typescript
import { GetDeploymentGitSource1 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSource1 = {
  type: 'github',
  repoId: '<value>',
};
```

## Fields

| Field    | Type                                                                                                                                                                                               | Required           | Description |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`   | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody2Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody2type.md) | :heavy_check_mark: | N/A         |
| `repoId` | _operations.GetDeploymentGitSourceDeploymentsRepoId_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `ref`    | _string_                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `sha`    | _string_                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `prId`   | _number_                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
