# UpdateProjectLink1

## Example Usage

```typescript
import { UpdateProjectLink1 } from '@vercel/client/models/operations';

let value: UpdateProjectLink1 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'http://right-mouse.biz',
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
| `type`             | [operations.UpdateProjectLinkType](../../models/operations/updateprojectlinktype.md)                 | :heavy_minus_sign: | N/A         |
| `createdAt`        | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `deployHooks`      | [operations.UpdateProjectLinkDeployHooks](../../models/operations/updateprojectlinkdeployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`  | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `updatedAt`        | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `sourceless`       | _boolean_                                                                                            | :heavy_minus_sign: | N/A         |
| `productionBranch` | _string_                                                                                             | :heavy_minus_sign: | N/A         |
