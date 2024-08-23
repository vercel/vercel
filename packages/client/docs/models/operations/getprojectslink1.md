# GetProjectsLink1

## Example Usage

```typescript
import { GetProjectsLink1 } from '@vercel/client/models/operations';

let value: GetProjectsLink1 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'https://right-damage.org',
    },
  ],
};
```

## Fields

| Field              | Type                                                                                             | Required           | Description |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `org`              | _string_                                                                                         | :heavy_minus_sign: | N/A         |
| `repo`             | _string_                                                                                         | :heavy_minus_sign: | N/A         |
| `repoId`           | _number_                                                                                         | :heavy_minus_sign: | N/A         |
| `type`             | [operations.GetProjectsLinkType](../../models/operations/getprojectslinktype.md)                 | :heavy_minus_sign: | N/A         |
| `createdAt`        | _number_                                                                                         | :heavy_minus_sign: | N/A         |
| `deployHooks`      | [operations.GetProjectsLinkDeployHooks](../../models/operations/getprojectslinkdeployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`  | _string_                                                                                         | :heavy_minus_sign: | N/A         |
| `updatedAt`        | _number_                                                                                         | :heavy_minus_sign: | N/A         |
| `sourceless`       | _boolean_                                                                                        | :heavy_minus_sign: | N/A         |
| `productionBranch` | _string_                                                                                         | :heavy_minus_sign: | N/A         |
