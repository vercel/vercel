# GetDeploymentCustomEnvironmentDeployments1

## Example Usage

```typescript
import { GetDeploymentCustomEnvironmentDeployments1 } from '@vercel/client/models/operations';

let value: GetDeploymentCustomEnvironmentDeployments1 = {
  id: '<id>',
  name: '<value>',
  slug: '<value>',
  type: 'production',
  createdAt: 3783.26,
  updatedAt: 6041.18,
};
```

## Fields

| Field           | Type                                                                                                                                 | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`            | _string_                                                                                                                             | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                             | :heavy_check_mark: | N/A         |
| `slug`          | _string_                                                                                                                             | :heavy_check_mark: | N/A         |
| `type`          | [operations.GetDeploymentCustomEnvironmentDeploymentsType](../../models/operations/getdeploymentcustomenvironmentdeploymentstype.md) | :heavy_check_mark: | N/A         |
| `description`   | _string_                                                                                                                             | :heavy_minus_sign: | N/A         |
| `branchMatcher` | [operations.GetDeploymentCustomEnvironmentBranchMatcher](../../models/operations/getdeploymentcustomenvironmentbranchmatcher.md)     | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                                                                             | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                                                                             | :heavy_check_mark: | N/A         |
| `domains`       | [operations.GetDeploymentCustomEnvironmentDomains](../../models/operations/getdeploymentcustomenvironmentdomains.md)[]               | :heavy_minus_sign: | N/A         |
