# UpdateFirewallConfigRequestBody2

Add a custom rule

## Example Usage

```typescript
import { UpdateFirewallConfigRequestBody2 } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: UpdateFirewallConfigRequestBody2 = {
  action: "rules.insert",
  value: {
    name: "<value>",
    active: false,
    conditionGroup: [
      {
        conditions: [
          {
            type: "header",
            op: "gt",
          },
        ],
      },
    ],
    action: {},
  },
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `action`                                                                                                             | [operations.UpdateFirewallConfigRequestBodyAction](../../models/operations/updatefirewallconfigrequestbodyaction.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `id`                                                                                                                 | *any*                                                                                                                | :heavy_minus_sign:                                                                                                   | N/A                                                                                                                  |
| `value`                                                                                                              | [operations.RequestBodyValue](../../models/operations/requestbodyvalue.md)                                           | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |