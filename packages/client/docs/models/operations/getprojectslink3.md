# GetProjectsLink3

## Example Usage

```typescript
import { GetProjectsLink3 } from '@vercel/client/models/operations';

let value: GetProjectsLink3 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'https://juvenile-crinoline.org',
    },
  ],
};
```

## Fields

| Field              | Type                                                                                                                             | Required           | Description |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `name`             | _string_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `slug`             | _string_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `owner`            | _string_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `type`             | [operations.GetProjectsLinkProjectsResponseType](../../models/operations/getprojectslinkprojectsresponsetype.md)                 | :heavy_minus_sign: | N/A         |
| `uuid`             | _string_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `workspaceUuid`    | _string_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `createdAt`        | _number_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `deployHooks`      | [operations.GetProjectsLinkProjectsResponseDeployHooks](../../models/operations/getprojectslinkprojectsresponsedeployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`  | _string_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `updatedAt`        | _number_                                                                                                                         | :heavy_minus_sign: | N/A         |
| `sourceless`       | _boolean_                                                                                                                        | :heavy_minus_sign: | N/A         |
| `productionBranch` | _string_                                                                                                                         | :heavy_minus_sign: | N/A         |
