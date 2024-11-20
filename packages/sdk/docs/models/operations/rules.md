# Rules

## Example Usage

```typescript
import { Rules } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: Rules = {
  name: "<value>",
  active: false,
  conditionGroup: [
    {
      conditions: [
        {
          type: "cookie",
          op: "gt",
        },
      ],
    },
  ],
  action: {},
};
```

## Fields

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                                                                                                   | *string*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |
| `name`                                                                                                                                                 | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `description`                                                                                                                                          | *string*                                                                                                                                               | :heavy_minus_sign:                                                                                                                                     | N/A                                                                                                                                                    |
| `active`                                                                                                                                               | *boolean*                                                                                                                                              | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `conditionGroup`                                                                                                                                       | [operations.ConditionGroup](../../models/operations/conditiongroup.md)[]                                                                               | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `action`                                                                                                                                               | [operations.PutFirewallConfigSecurityRequestRequestBodyRulesAction](../../models/operations/putfirewallconfigsecurityrequestrequestbodyrulesaction.md) | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |