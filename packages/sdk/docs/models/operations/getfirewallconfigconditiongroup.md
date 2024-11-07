# GetFirewallConfigConditionGroup

## Example Usage

```typescript
import { GetFirewallConfigConditionGroup } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigConditionGroup = {
  conditions: [
    {
      type: "protocol",
      op: "gt",
    },
  ],
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `conditions`                                                                                       | [operations.GetFirewallConfigConditions](../../models/operations/getfirewallconfigconditions.md)[] | :heavy_check_mark:                                                                                 | N/A                                                                                                |