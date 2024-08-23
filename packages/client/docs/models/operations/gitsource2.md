# GitSource2

## Example Usage

```typescript
import { GitSource2 } from '@vercel/client/models/operations';

let value: GitSource2 = {
  type: 'github',
  org: '<value>',
  repo: '<value>',
};
```

## Fields

| Field  | Type                                                                                                                                             | Required           | Description |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `type` | [operations.CreateDeploymentGitSourceDeploymentsResponse200Type](../../models/operations/createdeploymentgitsourcedeploymentsresponse200type.md) | :heavy_check_mark: | N/A         |
| `org`  | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `repo` | _string_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `ref`  | _string_                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `sha`  | _string_                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `prId` | _number_                                                                                                                                         | :heavy_minus_sign: | N/A         |
