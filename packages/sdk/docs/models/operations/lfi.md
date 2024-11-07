# Lfi

## Example Usage

```typescript
import { Lfi } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: Lfi = {
  active: false,
  action: "deny",
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `active`                                                                                                 | *boolean*                                                                                                | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `action`                                                                                                 | [operations.PutFirewallConfigSecurityAction](../../models/operations/putfirewallconfigsecurityaction.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |