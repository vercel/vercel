# PutFirewallConfigResponseBody

## Example Usage

```typescript
import { PutFirewallConfigResponseBody } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigResponseBody = {
  active: {
    ownerId: "<id>",
    projectKey: "<value>",
    id: "<id>",
    version: 413.46,
    updatedAt: "<value>",
    firewallEnabled: false,
    crs: {
      sd: {
        active: false,
        action: "log",
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
        action: "log",
      },
      xss: {
        active: false,
        action: "deny",
      },
      sqli: {
        active: false,
        action: "deny",
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
                type: "method",
                op: "sub",
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
        hostname: "upright-pigsty.com",
        ip: "70.92.198.247",
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