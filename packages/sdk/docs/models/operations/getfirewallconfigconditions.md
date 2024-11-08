# GetFirewallConfigConditions

## Example Usage

```typescript
import { GetFirewallConfigConditions } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigConditions = {
  type: "scheme",
  op: "nex",
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `type`                                                                               | [operations.GetFirewallConfigType](../../models/operations/getfirewallconfigtype.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `op`                                                                                 | [operations.GetFirewallConfigOp](../../models/operations/getfirewallconfigop.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `neg`                                                                                | *boolean*                                                                            | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `key`                                                                                | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `value`                                                                              | *operations.GetFirewallConfigValue*                                                  | :heavy_minus_sign:                                                                   | N/A                                                                                  |