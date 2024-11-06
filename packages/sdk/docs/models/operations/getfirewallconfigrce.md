# GetFirewallConfigRce

## Example Usage

```typescript
import { GetFirewallConfigRce } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigRce = {
  active: false,
  action: "deny",
};
```

## Fields

| Field                                                                                                                                                        | Type                                                                                                                                                         | Required                                                                                                                                                     | Description                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `active`                                                                                                                                                     | *boolean*                                                                                                                                                    | :heavy_check_mark:                                                                                                                                           | N/A                                                                                                                                                          |
| `action`                                                                                                                                                     | [operations.GetFirewallConfigSecurityResponse200ApplicationJSONAction](../../models/operations/getfirewallconfigsecurityresponse200applicationjsonaction.md) | :heavy_check_mark:                                                                                                                                           | N/A                                                                                                                                                          |