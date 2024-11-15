# GetFirewallConfigCrs

## Example Usage

```typescript
import { GetFirewallConfigCrs } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigCrs = {
  sd: {
    active: false,
    action: "deny",
  },
  ma: {
    active: false,
    action: "log",
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
    action: "deny",
  },
  php: {
    active: false,
    action: "deny",
  },
  gen: {
    active: false,
    action: "deny",
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
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `sd`                                                                                 | [operations.GetFirewallConfigSd](../../models/operations/getfirewallconfigsd.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `ma`                                                                                 | [operations.GetFirewallConfigMa](../../models/operations/getfirewallconfigma.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `lfi`                                                                                | [operations.GetFirewallConfigLfi](../../models/operations/getfirewallconfiglfi.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `rfi`                                                                                | [operations.GetFirewallConfigRfi](../../models/operations/getfirewallconfigrfi.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `rce`                                                                                | [operations.GetFirewallConfigRce](../../models/operations/getfirewallconfigrce.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `php`                                                                                | [operations.GetFirewallConfigPhp](../../models/operations/getfirewallconfigphp.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `gen`                                                                                | [operations.GetFirewallConfigGen](../../models/operations/getfirewallconfiggen.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `xss`                                                                                | [operations.GetFirewallConfigXss](../../models/operations/getfirewallconfigxss.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `sqli`                                                                               | [operations.GetFirewallConfigSqli](../../models/operations/getfirewallconfigsqli.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `sf`                                                                                 | [operations.GetFirewallConfigSf](../../models/operations/getfirewallconfigsf.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `java`                                                                               | [operations.GetFirewallConfigJava](../../models/operations/getfirewallconfigjava.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |