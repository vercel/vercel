# Discount

## Example Usage

```typescript
import { Discount } from "@vercel/sdk/models/components/authuser.js";

let value: Discount = {
  id: "<id>",
  coupon: {
    id: "<id>",
    name: "<value>",
    amountOff: 3134.21,
    percentageOff: 1908.50,
    durationInMonths: 9019.24,
    duration: "once",
  },
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `id`                                                   | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `coupon`                                               | [components.Coupon](../../models/components/coupon.md) | :heavy_check_mark:                                     | N/A                                                    |