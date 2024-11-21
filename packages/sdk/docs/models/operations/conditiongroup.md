# ConditionGroup

## Example Usage

```typescript
import { ConditionGroup } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: ConditionGroup = {
  conditions: [
    {
      type: "user_agent",
      op: "re",
    },
  ],
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `conditions`                                                     | [operations.Conditions](../../models/operations/conditions.md)[] | :heavy_check_mark:                                               | N/A                                                              |