# Coupon

## Example Usage

```typescript
import { Coupon } from "@vercel/sdk/models/components";

let value: Coupon = {
  id: "<id>",
  name: "<value>",
  amountOff: 7304.78,
  percentageOff: 5206.78,
  durationInMonths: 1928.46,
  duration: "repeating",
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