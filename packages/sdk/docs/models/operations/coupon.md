# Coupon

## Example Usage

```typescript
import { Coupon } from "@vercel/sdk/models/operations/createteam.js";

let value: Coupon = {
  id: "<id>",
  name: "<value>",
  amountOff: 7225.00,
  percentageOff: 2387.39,
  durationInMonths: 9438.28,
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