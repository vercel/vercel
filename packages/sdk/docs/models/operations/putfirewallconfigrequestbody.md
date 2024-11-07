# PutFirewallConfigRequestBody

## Example Usage

```typescript
import { PutFirewallConfigRequestBody } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigRequestBody = {
  firewallEnabled: false,
};
```

## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `firewallEnabled`                                                  | *boolean*                                                          | :heavy_check_mark:                                                 | N/A                                                                |
| `managedRules`                                                     | [operations.ManagedRules](../../models/operations/managedrules.md) | :heavy_minus_sign:                                                 | N/A                                                                |
| `crs`                                                              | [operations.Crs](../../models/operations/crs.md)                   | :heavy_minus_sign:                                                 | N/A                                                                |
| `rules`                                                            | [operations.Rules](../../models/operations/rules.md)[]             | :heavy_minus_sign:                                                 | N/A                                                                |
| `ips`                                                              | [operations.Ips](../../models/operations/ips.md)[]                 | :heavy_minus_sign:                                                 | N/A                                                                |