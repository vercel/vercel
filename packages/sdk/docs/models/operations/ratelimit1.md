# RateLimit1

## Example Usage

```typescript
import { RateLimit1 } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: RateLimit1 = {
  algo: "token_bucket",
  window: 2875.75,
  limit: 7689.99,
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
| `action`                                           | *operations.RateLimitAction*                       | :heavy_minus_sign:                                 | N/A                                                |