# Discount

## Example Usage

```typescript
import { Discount } from "@vercel/sdk/models/components";

let value: Discount = {
  id: "<id>",
  coupon: {
    id: "<id>",
    name: "<value>",
    amountOff: 4120.52,
    percentageOff: 7745.01,
    durationInMonths: 4983.88,
    duration: "forever",
  },
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `id`                                                   | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `coupon`                                               | [components.Coupon](../../models/components/coupon.md) | :heavy_check_mark:                                     | N/A                                                    |