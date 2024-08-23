# Five

## Example Usage

```typescript
import { Five } from '@vercel/client/models/operations';

let value: Five = {
  owner: '<value>',
  ref: '<value>',
  slug: '<value>',
  type: 'bitbucket',
};
```

## Fields

| Field   | Type                                                                                                                                     | Required           | Description |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `owner` | _string_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `ref`   | _string_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `sha`   | _string_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `slug`  | _string_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `type`  | [operations.CreateDeploymentGitSourceDeploymentsRequestType](../../models/operations/createdeploymentgitsourcedeploymentsrequesttype.md) | :heavy_check_mark: | N/A         |
