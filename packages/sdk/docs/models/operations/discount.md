# Discount

## Example Usage

```typescript
import { Discount } from "@vercel/sdk/models/operations/createteam.js";

let value: Discount = {
  id: "<id>",
  coupon: {
    id: "<id>",
    name: "<value>",
    amountOff: 2172.76,
    percentageOff: 1149.24,
    durationInMonths: 7240.73,
    duration: "forever",
  },
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `id`                                                   | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `coupon`                                               | [operations.Coupon](../../models/operations/coupon.md) | :heavy_check_mark:                                     | N/A                                                    |