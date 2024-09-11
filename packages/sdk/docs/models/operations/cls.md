# Cls

## Example Usage

```typescript
import { Cls } from "@vercel/sdk/models/operations";

let value: Cls = {
  value: 4,
  previousValue: 2,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            | Example                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `value`                                                                                                | *number*                                                                                               | :heavy_check_mark:                                                                                     | Cumulative Layout Shift value                                                                          | 4                                                                                                      |
| `previousValue`                                                                                        | *number*                                                                                               | :heavy_minus_sign:                                                                                     | Previous Cumulative Layout Shift value to display a delta                                              | 2                                                                                                      |
| `source`                                                                                               | [operations.UpdateCheckChecksRequestSource](../../models/operations/updatecheckchecksrequestsource.md) | :heavy_check_mark:                                                                                     | N/A                                                                                                    |                                                                                                        |