# PutFirewallConfigIps

## Example Usage

```typescript
import { PutFirewallConfigIps } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigIps = {
  id: "<id>",
  hostname: "deficient-fat.net",
  ip: "1afb:c4cc:ff9d:00c6:567a:cbcc:99ee:1b7f",
  action: "deny",
};
```

## Fields

| Field                                                                                                                          | Type                                                                                                                           | Required                                                                                                                       | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                                                                           | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `hostname`                                                                                                                     | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `ip`                                                                                                                           | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `notes`                                                                                                                        | *string*                                                                                                                       | :heavy_minus_sign:                                                                                                             | N/A                                                                                                                            |
| `action`                                                                                                                       | [operations.PutFirewallConfigSecurityResponse200Action](../../models/operations/putfirewallconfigsecurityresponse200action.md) | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |