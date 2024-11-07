# ConditionGroup

## Example Usage

```typescript
import { ConditionGroup } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: ConditionGroup = {
  conditions: [
    {
      type: "geo_city",
      op: "gt",
    },
  ],
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `conditions`                                                     | [operations.Conditions](../../models/operations/conditions.md)[] | :heavy_check_mark:                                               | N/A                                                              |