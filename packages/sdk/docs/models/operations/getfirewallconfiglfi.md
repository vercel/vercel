# GetFirewallConfigLfi

## Example Usage

```typescript
import { GetFirewallConfigLfi } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigLfi = {
  active: false,
  action: "deny",
};
```

## Fields

| Field                                                                                                                    | Type                                                                                                                     | Required                                                                                                                 | Description                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `active`                                                                                                                 | *boolean*                                                                                                                | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |
| `action`                                                                                                                 | [operations.GetFirewallConfigSecurityResponseAction](../../models/operations/getfirewallconfigsecurityresponseaction.md) | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |