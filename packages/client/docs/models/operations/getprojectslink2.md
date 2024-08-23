# GetProjectsLink2

## Example Usage

```typescript
import { GetProjectsLink2 } from '@vercel/client/models/operations';

let value: GetProjectsLink2 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'https://ornery-antechamber.net',
    },
  ],
};
```

## Fields

| Field                      | Type                                                                                                             | Required           | Description |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `projectId`                | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `projectName`              | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `projectNameWithNamespace` | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `projectNamespace`         | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `projectUrl`               | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `type`                     | [operations.GetProjectsLinkProjectsType](../../models/operations/getprojectslinkprojectstype.md)                 | :heavy_minus_sign: | N/A         |
| `createdAt`                | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `deployHooks`              | [operations.GetProjectsLinkProjectsDeployHooks](../../models/operations/getprojectslinkprojectsdeployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`          | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `updatedAt`                | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `sourceless`               | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `productionBranch`         | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
