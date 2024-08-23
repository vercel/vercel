# CreateDeploymentGitSource8

## Example Usage

```typescript
import { CreateDeploymentGitSource8 } from '@vercel/client/models/operations';

let value: CreateDeploymentGitSource8 = {
  type: 'gitlab',
  ref: '<value>',
  sha: '<value>',
  projectId: 168.71,
};
```

## Fields

| Field       | Type                                                                                                                                                                                                     | Required           | Description |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`      | [operations.CreateDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody8Type](../../models/operations/createdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody8type.md) | :heavy_check_mark: | N/A         |
| `ref`       | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `sha`       | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `projectId` | _number_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
