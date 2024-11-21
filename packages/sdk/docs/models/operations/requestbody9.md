# RequestBody9

Update an IP Blocking rule

## Example Usage

```typescript
import { RequestBody9 } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: RequestBody9 = {
  action: "ip.update",
  id: "<id>",
  value: {
    hostname: "complicated-saloon.info",
    ip: "657c:d36c:99ce:afbb:6ecd:1eb0:7faf:97cc",
    action: "log",
  },
};
```

## Fields

| Field                                                                                                                                                | Type                                                                                                                                                 | Required                                                                                                                                             | Description                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`                                                                                                                                             | [operations.UpdateFirewallConfigRequestBodySecurityRequest9Action](../../models/operations/updatefirewallconfigrequestbodysecurityrequest9action.md) | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `id`                                                                                                                                                 | *string*                                                                                                                                             | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |
| `value`                                                                                                                                              | [operations.UpdateFirewallConfigRequestBodySecurityRequest9Value](../../models/operations/updatefirewallconfigrequestbodysecurityrequest9value.md)   | :heavy_check_mark:                                                                                                                                   | N/A                                                                                                                                                  |