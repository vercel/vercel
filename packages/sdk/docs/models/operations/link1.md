# Link1

## Example Usage

```typescript
import { Link1 } from "@vercel/sdk/models/operations";

let value: Link1 = {
  deployHooks: [
    {
      id: "<id>",
      name: "<value>",
      ref: "<value>",
      url: "http://pretty-radar.org",
    },
  ],
};
```

## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `org`                                                              | *string*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `repo`                                                             | *string*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `repoId`                                                           | *number*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `type`                                                             | [operations.LinkType](../../models/operations/linktype.md)         | :heavy_minus_sign:                                                 | N/A                                                                |
| `createdAt`                                                        | *number*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `deployHooks`                                                      | [operations.DeployHooks](../../models/operations/deployhooks.md)[] | :heavy_check_mark:                                                 | N/A                                                                |
| `gitCredentialId`                                                  | *string*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `updatedAt`                                                        | *number*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |
| `sourceless`                                                       | *boolean*                                                          | :heavy_minus_sign:                                                 | N/A                                                                |
| `productionBranch`                                                 | *string*                                                           | :heavy_minus_sign:                                                 | N/A                                                                |