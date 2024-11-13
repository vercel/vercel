# GetFirewallConfigRules

## Example Usage

```typescript
import { GetFirewallConfigRules } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigRules = {
  id: "<id>",
  name: "<value>",
  active: false,
  conditionGroup: [
    {
      conditions: [
        {
          type: "ip_address",
          op: "ninc",
        },
      ],
    },
  ],
  action: {},
};
```

## Fields

| Field                                                                                                      | Type                                                                                                       | Required                                                                                                   | Description                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                       | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `name`                                                                                                     | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `description`                                                                                              | *string*                                                                                                   | :heavy_minus_sign:                                                                                         | N/A                                                                                                        |
| `active`                                                                                                   | *boolean*                                                                                                  | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `conditionGroup`                                                                                           | [operations.GetFirewallConfigConditionGroup](../../models/operations/getfirewallconfigconditiongroup.md)[] | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `action`                                                                                                   | [operations.GetFirewallConfigAction](../../models/operations/getfirewallconfigaction.md)                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |