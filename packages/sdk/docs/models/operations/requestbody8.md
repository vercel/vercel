# RequestBody8

Add an IP Blocking rule

## Example Usage

```typescript
import { RequestBody8 } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: RequestBody8 = {
  action: "ip.insert",
  value: {
    hostname: "wry-midwife.net",
    ip: "93.228.21.42",
    action: "log",
  },
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`                                                                                                                                             | [operations.UpdateFirewallConfigRequestBodySecurityRequest8Action](../../models/operations/updatefirewallconfigrequestbodysecurityrequest8action.md) | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `id`                                                                                                                                                 | *any*                                                                                                                                                | :heavy_minus_sign:                                                                                                                                   | N/A                                                                                                                                                  |
| `value`                                                                                                                                              | [operations.UpdateFirewallConfigRequestBodySecurityRequestValue](../../models/operations/updatefirewallconfigrequestbodysecurityrequestvalue.md)     | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |