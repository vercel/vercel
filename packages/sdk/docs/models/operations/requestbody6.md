# RequestBody6

Enable a managed rule

## Example Usage

```typescript
import { RequestBody6 } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: RequestBody6 = {
  action: "crs.update",
  id: "ma",
  value: {
    active: false,
    action: "deny",
  },
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`                                                                                                                                             | [operations.UpdateFirewallConfigRequestBodySecurityRequest6Action](../../models/operations/updatefirewallconfigrequestbodysecurityrequest6action.md) | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `id`                                                                                                                                                 | [operations.Id](../../models/operations/id.md)                                                                                                       | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `value`                                                                                                                                              | [operations.UpdateFirewallConfigRequestBodySecurityValue](../../models/operations/updatefirewallconfigrequestbodysecurityvalue.md)                   | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |