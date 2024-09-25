# Coupon

## Example Usage

```typescript
import { Coupon } from "@vercel/sdk/models/components/authuser.js";

let value: Coupon = {
  id: "<id>",
  name: "<value>",
  amountOff: 9246.23,
  percentageOff: 9747.87,
  durationInMonths: 4498.62,
  duration: "forever",
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
| `duration`                                                 | [components.Duration](../../models/components/duration.md) | :heavy_check_mark:                                         | N/A                                                        |