# PutFirewallConfigResponseBody

## Example Usage

```typescript
import { PutFirewallConfigResponseBody } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigResponseBody = {
  active: {
    ownerId: "<id>",
    projectKey: "<value>",
    id: "<id>",
    version: 9895.25,
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
        action: "deny",
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
        action: "log",
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
        action: "deny",
      },
      java: {
        active: false,
        action: "deny",
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
                type: "target_path",
                op: "nex",
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
        hostname: "natural-arcade.info",
        ip: "bc4c:cff9:d00c:6567:acbc:c99e:e1b7:f0df",
        action: "log",
      },
    ],
    changes: [
      {},
    ],
  },
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `active`                                               | [operations.Active](../../models/operations/active.md) | :heavy_check_mark:                                     | N/A                                                    |