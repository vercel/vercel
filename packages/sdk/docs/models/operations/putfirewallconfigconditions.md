# PutFirewallConfigConditions

## Example Usage

```typescript
import { PutFirewallConfigConditions } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigConditions = {
  type: "cookie",
  op: "lte",
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `type`                                                                                               | [operations.PutFirewallConfigSecurityType](../../models/operations/putfirewallconfigsecuritytype.md) | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `op`                                                                                                 | [operations.PutFirewallConfigOp](../../models/operations/putfirewallconfigop.md)                     | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `neg`                                                                                                | *boolean*                                                                                            | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `key`                                                                                                | *string*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `value`                                                                                              | *operations.PutFirewallConfigSecurityValue*                                                          | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |