# Conditions

## Example Usage

```typescript
import { Conditions } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: Conditions = {
  type: "rate_limit_api_id",
  op: "inc",
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `type`                                                                               | [operations.PutFirewallConfigType](../../models/operations/putfirewallconfigtype.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `op`                                                                                 | [operations.Op](../../models/operations/op.md)                                       | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `neg`                                                                                | *boolean*                                                                            | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `key`                                                                                | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `value`                                                                              | *operations.PutFirewallConfigValue*                                                  | :heavy_minus_sign:                                                                   | N/A                                                                                  |