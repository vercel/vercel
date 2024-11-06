# PutFirewallConfigRfi

## Example Usage

```typescript
import { PutFirewallConfigRfi } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigRfi = {
  active: false,
  action: "deny",
};
```

## Fields

| Field                                                                                                                                                                                | Type                                                                                                                                                                                 | Required                                                                                                                                                                             | Description                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `active`                                                                                                                                                                             | *boolean*                                                                                                                                                                            | :heavy_check_mark:                                                                                                                                                                   | N/A                                                                                                                                                                                  |
| `action`                                                                                                                                                                             | [operations.PutFirewallConfigSecurityResponse200ApplicationJSONResponseBodyAction](../../models/operations/putfirewallconfigsecurityresponse200applicationjsonresponsebodyaction.md) | :heavy_check_mark:                                                                                                                                                                   | N/A                                                                                                                                                                                  |