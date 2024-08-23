# GetDeploymentGitSource4

## Example Usage

```typescript
import { GetDeploymentGitSource4 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSource4 = {
  type: 'bitbucket',
  repoUuid: '<value>',
};
```

## Fields

| Field           | Type                                                                                                                                                                                                 | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`          | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody24Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody24type.md) | :heavy_check_mark: | N/A         |
| `workspaceUuid` | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `repoUuid`      | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `ref`           | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `sha`           | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `prId`          | _number_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
