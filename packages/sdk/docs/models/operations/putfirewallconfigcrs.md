# PutFirewallConfigCrs

## Example Usage

```typescript
import { PutFirewallConfigCrs } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigCrs = {
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
    action: "deny",
  },
  rfi: {
    active: false,
    action: "deny",
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
    action: "log",
  },
  sqli: {
    active: false,
    action: "deny",
  },
  sf: {
    active: false,
    action: "log",
  },
  java: {
    active: false,
    action: "deny",
  },
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `sd`                                                                                 | [operations.PutFirewallConfigSd](../../models/operations/putfirewallconfigsd.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `ma`                                                                                 | [operations.PutFirewallConfigMa](../../models/operations/putfirewallconfigma.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `lfi`                                                                                | [operations.PutFirewallConfigLfi](../../models/operations/putfirewallconfiglfi.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `rfi`                                                                                | [operations.PutFirewallConfigRfi](../../models/operations/putfirewallconfigrfi.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `rce`                                                                                | [operations.PutFirewallConfigRce](../../models/operations/putfirewallconfigrce.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `php`                                                                                | [operations.PutFirewallConfigPhp](../../models/operations/putfirewallconfigphp.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `gen`                                                                                | [operations.PutFirewallConfigGen](../../models/operations/putfirewallconfiggen.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `xss`                                                                                | [operations.PutFirewallConfigXss](../../models/operations/putfirewallconfigxss.md)   | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `sqli`                                                                               | [operations.PutFirewallConfigSqli](../../models/operations/putfirewallconfigsqli.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `sf`                                                                                 | [operations.PutFirewallConfigSf](../../models/operations/putfirewallconfigsf.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `java`                                                                               | [operations.PutFirewallConfigJava](../../models/operations/putfirewallconfigjava.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |