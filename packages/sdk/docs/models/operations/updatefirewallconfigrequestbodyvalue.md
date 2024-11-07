# UpdateFirewallConfigRequestBodyValue

## Example Usage

```typescript
import { UpdateFirewallConfigRequestBodyValue } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: UpdateFirewallConfigRequestBodyValue = {
  name: "<value>",
  active: false,
  conditionGroup: [
    {
      conditions: [
        {
          type: "query",
          op: "nex",
        },
      ],
    },
  ],
  action: {},
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                                                                                               | *string*                                                                                                                                             | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `description`                                                                                                                                        | *string*                                                                                                                                             | :heavy_minus_sign:                                                                                                                                   | N/A                                                                                                                                                  |
| `active`                                                                                                                                             | *boolean*                                                                                                                                            | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `conditionGroup`                                                                                                                                     | [operations.UpdateFirewallConfigRequestBodyConditionGroup](../../models/operations/updatefirewallconfigrequestbodyconditiongroup.md)[]               | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `action`                                                                                                                                             | [operations.UpdateFirewallConfigRequestBodySecurityRequest3Action](../../models/operations/updatefirewallconfigrequestbodysecurityrequest3action.md) | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |