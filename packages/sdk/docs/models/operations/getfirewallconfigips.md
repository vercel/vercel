# GetFirewallConfigIps

## Example Usage

```typescript
import { GetFirewallConfigIps } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigIps = {
  id: "<id>",
  hostname: "awful-cork.name",
  ip: "cdfa:ac2f:b3f7:ddb2:c7fd:c7af:ba0f:c56b",
  action: "deny",
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                     | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `hostname`                                                                                               | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `ip`                                                                                                     | *string*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `notes`                                                                                                  | *string*                                                                                                 | :heavy_minus_sign:                                                                                       | N/A                                                                                                      |
| `action`                                                                                                 | [operations.GetFirewallConfigSecurityAction](../../models/operations/getfirewallconfigsecurityaction.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |