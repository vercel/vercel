# GetDeploymentGitSource7

## Example Usage

```typescript
import { GetDeploymentGitSource7 } from '@vercel/client/models/operations';

let value: GetDeploymentGitSource7 = {
  type: 'github',
  ref: '<value>',
  sha: '<value>',
  repoId: 4492.92,
};
```

## Fields

| Field    | Type                                                                                                                                                                                                 | Required           | Description |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `type`   | [operations.GetDeploymentGitSourceDeploymentsResponse200ApplicationJSONResponseBody27Type](../../models/operations/getdeploymentgitsourcedeploymentsresponse200applicationjsonresponsebody27type.md) | :heavy_check_mark: | N/A         |
| `ref`    | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `sha`    | _string_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `repoId` | _number_                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `org`    | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `repo`   | _string_                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
