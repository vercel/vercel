# CreateProjectLink1

## Example Usage

```typescript
import { CreateProjectLink1 } from '@vercel/client/models/operations';

let value: CreateProjectLink1 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'http://warm-race.net',
    },
  ],
};
```

## Fields

| Field              | Type                                                                                                 | Required           | Description |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `org`              | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `repo`             | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `repoId`           | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `type`             | [operations.CreateProjectLinkType](../../models/operations/createprojectlinktype.md)                 | :heavy_minus_sign: | N/A         |
| `createdAt`        | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `deployHooks`      | [operations.CreateProjectLinkDeployHooks](../../models/operations/createprojectlinkdeployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`  | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `updatedAt`        | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `sourceless`       | _boolean_                                                                                            | :heavy_minus_sign: | N/A         |
| `productionBranch` | _string_                                                                                             | :heavy_minus_sign: | N/A         |
