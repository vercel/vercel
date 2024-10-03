# Coupon

## Example Usage

```typescript
import { Coupon } from "@vercel/sdk/models/operations/createteam.js";

let value: Coupon = {
  id: "<id>",
  name: "<value>",
  amountOff: 1020.20,
  percentageOff: 7878.49,
  durationInMonths: 7080.75,
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