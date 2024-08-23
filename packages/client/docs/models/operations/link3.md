# Link3

## Example Usage

```typescript
import { Link3 } from '@vercel/client/models/operations';

let value: Link3 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'https://treasured-dirt.name',
    },
  ],
};
```

## Fields

| Field              | Type                                                                                                                   | Required           | Description |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `name`             | _string_                                                                                                               | :heavy_minus_sign: | N/A         |
| `slug`             | _string_                                                                                                               | :heavy_minus_sign: | N/A         |
| `owner`            | _string_                                                                                                               | :heavy_minus_sign: | N/A         |
| `type`             | [operations.UpdateProjectDataCacheLinkProjectsType](../../models/operations/updateprojectdatacachelinkprojectstype.md) | :heavy_minus_sign: | N/A         |
| `uuid`             | _string_                                                                                                               | :heavy_minus_sign: | N/A         |
| `workspaceUuid`    | _string_                                                                                                               | :heavy_minus_sign: | N/A         |
| `createdAt`        | _number_                                                                                                               | :heavy_minus_sign: | N/A         |
| `deployHooks`      | [operations.UpdateProjectDataCacheLinkDeployHooks](../../models/operations/updateprojectdatacachelinkdeployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`  | _string_                                                                                                               | :heavy_minus_sign: | N/A         |
| `updatedAt`        | _number_                                                                                                               | :heavy_minus_sign: | N/A         |
| `sourceless`       | _boolean_                                                                                                              | :heavy_minus_sign: | N/A         |
| `productionBranch` | _string_                                                                                                               | :heavy_minus_sign: | N/A         |
