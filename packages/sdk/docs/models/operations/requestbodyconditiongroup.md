# RequestBodyConditionGroup

## Example Usage

```typescript
import { RequestBodyConditionGroup } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: RequestBodyConditionGroup = {
  conditions: [
    {
      type: "header",
      op: "lte",
    },
  ],
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `conditions`                                                                           | [operations.RequestBodyConditions](../../models/operations/requestbodyconditions.md)[] | :heavy_check_mark:                                                                     | N/A                                                                                    |