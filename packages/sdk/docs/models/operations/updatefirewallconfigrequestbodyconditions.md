# UpdateFirewallConfigRequestBodyConditions

## Example Usage

```typescript
import { UpdateFirewallConfigRequestBodyConditions } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: UpdateFirewallConfigRequestBodyConditions = {
  type: "scheme",
  op: "ex",
};
```

## Fields

| Field                                                                                                                            | Type                                                                                                                             | Required                                                                                                                         | Description                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                                           | [operations.UpdateFirewallConfigRequestBodySecurityType](../../models/operations/updatefirewallconfigrequestbodysecuritytype.md) | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `op`                                                                                                                             | [operations.UpdateFirewallConfigRequestBodyOp](../../models/operations/updatefirewallconfigrequestbodyop.md)                     | :heavy_check_mark:                                                                                                               | N/A                                                                                                                              |
| `neg`                                                                                                                            | *boolean*                                                                                                                        | :heavy_minus_sign:                                                                                                               | N/A                                                                                                                              |
| `key`                                                                                                                            | *string*                                                                                                                         | :heavy_minus_sign:                                                                                                               | N/A                                                                                                                              |
| `value`                                                                                                                          | *operations.UpdateFirewallConfigRequestBodySecurityRequest3Value*                                                                | :heavy_minus_sign:                                                                                                               | N/A                                                                                                                              |