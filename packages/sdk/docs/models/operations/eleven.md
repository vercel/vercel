# Eleven

Update a managed ruleset

## Example Usage

```typescript
import { Eleven } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: Eleven = {
  action: "managedRules.update",
  id: "owasp",
  value: {
    active: false,
  },
};
```

## Fields

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `action`                                                                                                                                               | [operations.UpdateFirewallConfigRequestBodySecurityRequest11Action](../../models/operations/updatefirewallconfigrequestbodysecurityrequest11action.md) | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `id`                                                                                                                                                   | [operations.RequestBodyId](../../models/operations/requestbodyid.md)                                                                                   | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |
| `value`                                                                                                                                                | [operations.UpdateFirewallConfigRequestBodySecurityRequest11Value](../../models/operations/updatefirewallconfigrequestbodysecurityrequest11value.md)   | :heavy_check_mark:                                                                                                                                     | N/A                                                                                                                                                    |