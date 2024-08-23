# GetDeploymentGitSource3

## Example Usage

```typescript
import { GetDeploymentGitSource3 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSource3 = {
  type: 'gitlab',
  projectId: '<value>',
};
```

## Fields

| Field       | Type                                                                                                                                                                                                 | Required           | Description |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`      | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody23Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody23type.md) | :heavy_check_mark: | N/A         |
| `projectId` | _operations.GetDeploymentGitSourceDeploymentsProjectId_                                                                                                                                              | :heavy_check_mark: | N/A         |
| `ref`       | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`       | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `prId`      | _number_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
