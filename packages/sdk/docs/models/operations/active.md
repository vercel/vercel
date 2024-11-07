# Active

## Example Usage

```typescript
import { Active } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: Active = {
  ownerId: "<id>",
  projectKey: "<value>",
  id: "<id>",
  version: 6121.81,
  updatedAt: "<value>",
  firewallEnabled: false,
  crs: {
    sd: {
      active: false,
      action: "log",
    },
    ma: {
      active: false,
      action: "deny",
    },
    lfi: {
      active: false,
      action: "log",
    },
    rfi: {
      active: false,
      action: "log",
    },
    rce: {
      active: false,
      action: "log",
    },
    php: {
      active: false,
      action: "deny",
    },
    gen: {
      active: false,
      action: "log",
    },
    xss: {
      active: false,
      action: "deny",
    },
    sqli: {
      active: false,
      action: "log",
    },
    sf: {
      active: false,
      action: "log",
    },
    java: {
      active: false,
      action: "log",
    },
  },
  rules: [
    {
      id: "<id>",
      name: "<value>",
      active: false,
      conditionGroup: [
        {
          conditions: [
            {
              type: "method",
              op: "gt",
            },
          ],
        },
      ],
      action: {},
    },
  ],
  ips: [
    {
      id: "<id>",
      hostname: "prestigious-valuable.name",
      ip: "feba:d022:a7ed:8bee:cd1e:bb19:55bd:90ff",
      action: "deny",
    },
  ],
  changes: [
    {},
  ],
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ownerId`                                                                                            | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `projectKey`                                                                                         | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `id`                                                                                                 | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `version`                                                                                            | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `updatedAt`                                                                                          | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `firewallEnabled`                                                                                    | *boolean*                                                                                            | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `crs`                                                                                                | [operations.PutFirewallConfigCrs](../../models/operations/putfirewallconfigcrs.md)                   | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `rules`                                                                                              | [operations.PutFirewallConfigRules](../../models/operations/putfirewallconfigrules.md)[]             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `ips`                                                                                                | [operations.PutFirewallConfigIps](../../models/operations/putfirewallconfigips.md)[]                 | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `changes`                                                                                            | [operations.PutFirewallConfigChanges](../../models/operations/putfirewallconfigchanges.md)[]         | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `managedRules`                                                                                       | [operations.PutFirewallConfigManagedRules](../../models/operations/putfirewallconfigmanagedrules.md) | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |