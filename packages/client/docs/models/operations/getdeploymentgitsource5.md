# GetDeploymentGitSource5

## Example Usage

```typescript
import { GetDeploymentGitSource5 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSource5 = {
  type: 'bitbucket',
  owner: '<value>',
  slug: '<value>',
};
```

## Fields

| Field   | Type                                                                                                                                                                                                 | Required           | Description |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`  | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody25Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody25type.md) | :heavy_check_mark: | N/A         |
| `owner` | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `slug`  | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `ref`   | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`   | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `prId`  | _number_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
