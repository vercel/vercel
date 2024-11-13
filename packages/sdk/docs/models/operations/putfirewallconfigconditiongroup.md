# PutFirewallConfigConditionGroup

## Example Usage

```typescript
import { PutFirewallConfigConditionGroup } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigConditionGroup = {
  conditions: [
    {
      type: "host",
      op: "inc",
    },
  ],
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `conditions`                                                                                       | [operations.PutFirewallConfigConditions](../../models/operations/putfirewallconfigconditions.md)[] | :heavy_check_mark:                                                                                 | N/A                                                                                                |