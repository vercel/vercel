# Link1

## Example Usage

```typescript
import { Link1 } from '@vercel/client/models/operations';

let value: Link1 = {
  deployHooks: [
    {
      id: '<id>',
      name: '<value>',
      ref: '<value>',
      url: 'http://pretty-radar.org',
    },
  ],
};
```

## Fields

| Field              | Type                                                               | Required           | Description |
| ------------------ | ------------------------------------------------------------------ | ------------------ | ----------- |
| `org`              | _string_                                                           | :heavy_minus_sign: | N/A         |
| `repo`             | _string_                                                           | :heavy_minus_sign: | N/A         |
| `repoId`           | _number_                                                           | :heavy_minus_sign: | N/A         |
| `type`             | [operations.LinkType](../../models/operations/linktype.md)         | :heavy_minus_sign: | N/A         |
| `createdAt`        | _number_                                                           | :heavy_minus_sign: | N/A         |
| `deployHooks`      | [operations.DeployHooks](../../models/operations/deployhooks.md)[] | :heavy_check_mark: | N/A         |
| `gitCredentialId`  | _string_                                                           | :heavy_minus_sign: | N/A         |
| `updatedAt`        | _number_                                                           | :heavy_minus_sign: | N/A         |
| `sourceless`       | _boolean_                                                          | :heavy_minus_sign: | N/A         |
| `productionBranch` | _string_                                                           | :heavy_minus_sign: | N/A         |
