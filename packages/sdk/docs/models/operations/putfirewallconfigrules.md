# PutFirewallConfigRules

## Example Usage

```typescript
import { PutFirewallConfigRules } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigRules = {
  id: "<id>",
  name: "<value>",
  active: false,
  conditionGroup: [
    {
      conditions: [
        {
          type: "geo_as_number",
          op: "sub",
        },
      ],
    },
  ],
  action: {},
};
```

## Fields

| Field                                                                                                                    | Type                                                                                                                     | Required                                                                                                                 | Description                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                                                                     | *string*                                                                                                                 | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |
| `name`                                                                                                                   | *string*                                                                                                                 | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |
| `description`                                                                                                            | *string*                                                                                                                 | :heavy_minus_sign:                                                                                                       | N/A                                                                                                                      |
| `active`                                                                                                                 | *boolean*                                                                                                                | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |
| `conditionGroup`                                                                                                         | [operations.PutFirewallConfigConditionGroup](../../models/operations/putfirewallconfigconditiongroup.md)[]               | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |
| `action`                                                                                                                 | [operations.PutFirewallConfigSecurityResponseAction](../../models/operations/putfirewallconfigsecurityresponseaction.md) | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |