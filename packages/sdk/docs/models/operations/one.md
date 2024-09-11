# One

## Example Usage

```typescript
import { One } from "@vercel/sdk/models/operations";

let value: One = {
  ref: "<value>",
  repoId: 2790.68,
  type: "github",
};
```

## Fields

| Field                                              | Type                                               | Required                                           | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `ref`                                              | *string*                                           | :heavy_check_mark:                                 | N/A                                                |
| `repoId`                                           | *operations.RepoId*                                | :heavy_check_mark:                                 | N/A                                                |
| `sha`                                              | *string*                                           | :heavy_minus_sign:                                 | N/A                                                |
| `type`                                             | [operations.Type](../../models/operations/type.md) | :heavy_check_mark:                                 | N/A                                                |