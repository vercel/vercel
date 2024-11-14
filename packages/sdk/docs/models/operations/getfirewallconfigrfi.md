# GetFirewallConfigRfi

## Example Usage

```typescript
import { GetFirewallConfigRfi } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigRfi = {
  active: false,
  action: "log",
};
```

## Fields

| Field                                                                                                                          | Type                                                                                                                           | Required                                                                                                                       | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `active`                                                                                                                       | *boolean*                                                                                                                      | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `action`                                                                                                                       | [operations.GetFirewallConfigSecurityResponse200Action](../../models/operations/getfirewallconfigsecurityresponse200action.md) | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |