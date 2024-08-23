# CreateProjectLink2

## Example Usage

```typescript
import { CreateProjectLink2 } from '@vercel/client/models/operations';

let value: CreateProjectLink2 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'https://glorious-crash.org',
    },
  ],
};
```

## Fields

| Field                      | Type                                                                                                                 | Required           | Description |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `projectId`                | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `projectName`              | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `projectNameWithNamespace` | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `projectNamespace`         | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `projectUrl`               | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `type`                     | [operations.CreateProjectLinkProjectsType](../../models/operations/createprojectlinkprojectstype.md)                 | :heavy_minus_sign: | N/A         |
| `createdAt`                | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `deployHooks`              | [operations.CreateProjectLinkProjectsDeployHooks](../../models/operations/createprojectlinkprojectsdeployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`          | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `updatedAt`                | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `sourceless`               | _boolean_                                                                                                            | :heavy_minus_sign: | N/A         |
| `productionBranch`         | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
