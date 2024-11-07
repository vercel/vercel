# UpdateFirewallConfigRequestBody3

Update a custom rule

## Example Usage

```typescript
import { UpdateFirewallConfigRequestBody3 } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: UpdateFirewallConfigRequestBody3 = {
  action: "rules.update",
  id: "<id>",
  value: {
    name: "<value>",
    active: false,
    conditionGroup: [
      {
        conditions: [
          {
            type: "cookie",
            op: "inc",
          },
        ],
      },
    ],
    action: {},
  },
};
```

## Fields

| Field                                                                                                                                | Type                                                                                                                                 | Required                                                                                                                             | Description                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `action`                                                                                                                             | [operations.UpdateFirewallConfigRequestBodySecurityAction](../../models/operations/updatefirewallconfigrequestbodysecurityaction.md) | :heavy_check_mark:                                                                                                                   | N/A                                                                                                                                  |
| `id`                                                                                                                                 | *string*                                                                                                                             | :heavy_check_mark:                                                                                                                   | N/A                                                                                                                                  |
| `value`                                                                                                                              | [operations.UpdateFirewallConfigRequestBodyValue](../../models/operations/updatefirewallconfigrequestbodyvalue.md)                   | :heavy_check_mark:                                                                                                                   | N/A                                                                                                                                  |