# CreateDeploymentGitSource9

## Example Usage

```typescript
import { CreateDeploymentGitSource9 } from '@vercel/client/models/operations';

let value: CreateDeploymentGitSource9 = {
  type: 'bitbucket',
  ref: '<value>',
  sha: '<value>',
  workspaceUuid: '<value>',
  repoUuid: '<value>',
};
```

## Fields

| Field           | Type                                                                                                                                                                                                     | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`          | [operations.CreateDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody9Type](../../models/operations/createdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody9type.md) | :heavy_check_mark: | N/A         |
| `ref`           | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `sha`           | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `owner`         | _string_                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `slug`          | _string_                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `workspaceUuid` | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `repoUuid`      | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
