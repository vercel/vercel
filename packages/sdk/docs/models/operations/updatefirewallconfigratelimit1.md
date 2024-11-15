# UpdateFirewallConfigRateLimit1

## Example Usage

```typescript
import { UpdateFirewallConfigRateLimit1 } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: UpdateFirewallConfigRateLimit1 = {
  algo: "fixed_window",
  window: 2478.39,
  limit: 1928.81,
  keys: [
    "<value>",
  ],
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `algo`                                                               | [operations.RateLimitAlgo](../../models/operations/ratelimitalgo.md) | :heavy_check_mark:                                                   | N/A                                                                  |
| `window`                                                             | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `limit`                                                              | *number*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `keys`                                                               | *string*[]                                                           | :heavy_check_mark:                                                   | N/A                                                                  |
| `action`                                                             | *operations.UpdateFirewallConfigRateLimitAction*                     | :heavy_minus_sign:                                                   | N/A                                                                  |