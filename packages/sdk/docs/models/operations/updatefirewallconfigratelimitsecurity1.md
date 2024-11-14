# UpdateFirewallConfigRateLimitSecurity1

## Example Usage

```typescript
import { UpdateFirewallConfigRateLimitSecurity1 } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: UpdateFirewallConfigRateLimitSecurity1 = {
  algo: "token_bucket",
  window: 4787.73,
  limit: 2439.41,
  keys: [
    "<value>",
  ],
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `algo`                                                                                                       | [operations.UpdateFirewallConfigRateLimitAlgo](../../models/operations/updatefirewallconfigratelimitalgo.md) | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `window`                                                                                                     | *number*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `limit`                                                                                                      | *number*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `keys`                                                                                                       | *string*[]                                                                                                   | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `action`                                                                                                     | *operations.UpdateFirewallConfigRateLimitSecurityAction*                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |