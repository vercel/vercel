# Discount

## Example Usage

```typescript
import { Discount } from "@vercel/sdk/models/operations/createteam.js";

let value: Discount = {
  id: "<id>",
  coupon: {
    id: "<id>",
    name: "<value>",
    amountOff: 2875.75,
    percentageOff: 7689.99,
    durationInMonths: 831.65,
    duration: "once",
  },
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `id`                                                   | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `coupon`                                               | [operations.Coupon](../../models/operations/coupon.md) | :heavy_check_mark:                                     | N/A                                                    |