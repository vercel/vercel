# CancelDeploymentCustomEnvironment1

## Example Usage

```typescript
import { CancelDeploymentCustomEnvironment1 } from '@vercel/client/models/operations';

let value: CancelDeploymentCustomEnvironment1 = {
  id: '<id>',
  name: '<value>',
  slug: '<value>',
  type: 'development',
  createdAt: 2473.99,
  updatedAt: 8784.93,
};
```

## Fields

| Field           | Type                                                                                                                 | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`            | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `slug`          | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `type`          | [operations.CancelDeploymentCustomEnvironmentType](../../models/operations/canceldeploymentcustomenvironmenttype.md) | :heavy_check_mark: | N/A         |
| `description`   | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `branchMatcher` | [operations.CustomEnvironmentBranchMatcher](../../models/operations/customenvironmentbranchmatcher.md)               | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                                                             | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                                                             | :heavy_check_mark: | N/A         |
| `domains`       | [operations.CustomEnvironmentDomains](../../models/operations/customenvironmentdomains.md)[]                         | :heavy_minus_sign: | N/A         |
