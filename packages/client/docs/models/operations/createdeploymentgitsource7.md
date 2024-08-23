# CreateDeploymentGitSource7

## Example Usage

```typescript
import { CreateDeploymentGitSource7 } from '@vercel/client/models/operations';

let value: CreateDeploymentGitSource7 = {
  type: 'github',
  ref: '<value>',
  sha: '<value>',
  repoId: 6672.85,
};
```

## Fields

| Field    | Type                                                                                                                                                                                                     | Required           | Description |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`   | [operations.CreateDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody7Type](../../models/operations/createdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody7type.md) | :heavy_check_mark: | N/A         |
| `ref`    | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `sha`    | _string_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `repoId` | _number_                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `org`    | _string_                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `repo`   | _string_                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
