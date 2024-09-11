# Coupon

## Example Usage

```typescript
import { Coupon } from "@vercel/sdk/models/operations";

let value: Coupon = {
  id: "<id>",
  name: "<value>",
  amountOff: 5845.93,
  percentageOff: 4755.89,
  durationInMonths: 7566.54,
  duration: "once",
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `id`                                                       | *string*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `name`                                                     | *string*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `amountOff`                                                | *number*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `percentageOff`                                            | *number*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `durationInMonths`                                         | *number*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `duration`                                                 | [operations.Duration](../../models/operations/duration.md) | :heavy_check_mark:                                         | N/A                                                        |