# CustomEnvironment1

## Example Usage

```typescript
import { CustomEnvironment1 } from '@vercel/client/models/operations';

let value: CustomEnvironment1 = {
  id: '<id>',
  name: '<value>',
  slug: '<value>',
  type: 'preview',
  createdAt: 8338.19,
  updatedAt: 9627.71,
};
```

## Fields

| Field           | Type                                                                                                                         | Required           | Description |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`            | _string_                                                                                                                     | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                                                     | :heavy_check_mark: | N/A         |
| `slug`          | _string_                                                                                                                     | :heavy_check_mark: | N/A         |
| `type`          | [operations.CustomEnvironmentType](../../models/operations/customenvironmenttype.md)                                         | :heavy_check_mark: | N/A         |
| `description`   | _string_                                                                                                                     | :heavy_minus_sign: | N/A         |
| `branchMatcher` | [operations.BranchMatcher](../../models/operations/branchmatcher.md)                                                         | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                                                                     | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                                                                     | :heavy_check_mark: | N/A         |
| `domains`       | [operations.CreateDeploymentCustomEnvironmentDomains](../../models/operations/createdeploymentcustomenvironmentdomains.md)[] | :heavy_minus_sign: | N/A         |
