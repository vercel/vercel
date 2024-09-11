# Mitigate

## Example Usage

```typescript
import { Mitigate } from "@vercel/sdk/models/operations";

let value: Mitigate = {
  action: "challenge",
  ruleId: "<value>",
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `action`                                               | [operations.Action](../../models/operations/action.md) | :heavy_check_mark:                                     | N/A                                                    |
| `ruleId`                                               | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `ttl`                                                  | *number*                                               | :heavy_minus_sign:                                     | N/A                                                    |
| `erl`                                                  | [operations.Erl](../../models/operations/erl.md)       | :heavy_minus_sign:                                     | N/A                                                    |