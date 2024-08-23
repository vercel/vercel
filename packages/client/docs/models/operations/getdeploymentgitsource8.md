# GetDeploymentGitSource8

## Example Usage

```typescript
import { GetDeploymentGitSource8 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSource8 = {
  type: 'gitlab',
  ref: '<value>',
  sha: '<value>',
  projectId: 5039.34,
};
```

## Fields

| Field       | Type                                                                                                                                                                                                 | Required           | Description |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`      | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody28Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody28type.md) | :heavy_check_mark: | N/A         |
| `ref`       | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `sha`       | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `projectId` | _number_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
