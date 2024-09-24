# Discount

## Example Usage

```typescript
import { Discount } from "@vercel/sdk/models/components/authuser.js";

let value: Discount = {
  id: "<id>",
  coupon: {
    id: "<id>",
    name: "<value>",
    amountOff: 2916.66,
    percentageOff: 7763.34,
    durationInMonths: 2733.50,
    duration: "repeating",
  },
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `id`                                                   | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `coupon`                                               | [components.Coupon](../../models/components/coupon.md) | :heavy_check_mark:                                     | N/A                                                    |