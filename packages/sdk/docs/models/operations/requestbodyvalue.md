# RequestBodyValue

## Example Usage

```typescript
import { RequestBodyValue } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: RequestBodyValue = {
  name: "<value>",
  active: false,
  conditionGroup: [
    {
      conditions: [
        {
          type: "method",
          op: "ex",
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
| `conditionGroup`                                                                                                                                     | [operations.RequestBodyConditionGroup](../../models/operations/requestbodyconditiongroup.md)[]                                                       | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `action`                                                                                                                                             | [operations.UpdateFirewallConfigRequestBodySecurityRequest2Action](../../models/operations/updatefirewallconfigrequestbodysecurityrequest2action.md) | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |