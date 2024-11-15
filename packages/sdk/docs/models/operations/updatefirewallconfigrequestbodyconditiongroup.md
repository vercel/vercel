# UpdateFirewallConfigRequestBodyConditionGroup

## Example Usage

```typescript
import { UpdateFirewallConfigRequestBodyConditionGroup } from "@vercel/sdk/models/operations/updatefirewallconfig.js";

let value: UpdateFirewallConfigRequestBodyConditionGroup = {
  conditions: [
    {
      type: "ja3_digest",
      op: "ex",
    },
  ],
};
```

## Fields

| Field                                                                                                                          | Type                                                                                                                           | Required                                                                                                                       | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `conditions`                                                                                                                   | [operations.UpdateFirewallConfigRequestBodyConditions](../../models/operations/updatefirewallconfigrequestbodyconditions.md)[] | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |