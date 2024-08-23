# GetDeploymentGitSource2

## Example Usage

```typescript
import { GetDeploymentGitSource2 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSource2 = {
  type: 'github',
  org: '<value>',
  repo: '<value>',
};
```

## Fields

| Field  | Type                                                                                                                                                                                                 | Required           | Description |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type` | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody22Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody22type.md) | :heavy_check_mark: | N/A         |
| `org`  | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `repo` | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `ref`  | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`  | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `prId` | _number_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
