# ManagedRules

## Example Usage

```typescript
import { ManagedRules } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: ManagedRules = {
  owasp: {
    active: false,
  },
};
```

## Fields

| Field                                                | Type                                                 | Required                                             | Description                                          |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `owasp`                                              | [operations.Owasp](../../models/operations/owasp.md) | :heavy_check_mark:                                   | N/A                                                  |