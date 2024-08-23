# GetDeploymentCustomEnvironment1

## Example Usage

```typescript
import { GetDeploymentCustomEnvironment1 } from '@vercel/client/models/operations';

let value: GetDeploymentCustomEnvironment1 = {
  id: '<id>',
  name: '<value>',
  slug: '<value>',
  type: 'production',
  createdAt: 3790.57,
  updatedAt: 3742.44,
};
```

## Fields

| Field           | Type                                                                                                                                                   | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`            | _string_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `slug`          | _string_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `type`          | [operations.GetDeploymentCustomEnvironmentType](../../models/operations/getdeploymentcustomenvironmenttype.md)                                         | :heavy_check_mark: | N/A         |
| `description`   | _string_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `branchMatcher` | [operations.GetDeploymentCustomEnvironmentDeploymentsBranchMatcher](../../models/operations/getdeploymentcustomenvironmentdeploymentsbranchmatcher.md) | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `domains`       | [operations.GetDeploymentCustomEnvironmentDeploymentsDomains](../../models/operations/getdeploymentcustomenvironmentdeploymentsdomains.md)[]           | :heavy_minus_sign: | N/A         |
