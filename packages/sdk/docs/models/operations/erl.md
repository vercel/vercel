# Erl

## Example Usage

```typescript
import { Erl } from "@vercel/sdk/models/operations/updateprojectdatacache.js";

let value: Erl = {
  algo: "token_bucket",
  window: 7992.03,
  limit: 6304.48,
  keys: [
    "<value>",
  ],
};
```

## Fields

| Field                                              | Type                                               | Required                                           | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `algo`                                             | [operations.Algo](../../models/operations/algo.md) | :heavy_check_mark:                                 | N/A                                                |
| `window`                                           | *number*                                           | :heavy_check_mark:                                 | N/A                                                |
| `limit`                                            | *number*                                           | :heavy_check_mark:                                 | N/A                                                |
| `keys`                                             | *string*[]                                         | :heavy_check_mark:                                 | N/A                                                |