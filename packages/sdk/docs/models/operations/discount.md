# Discount

## Example Usage

```typescript
import { Discount } from "@vercel/sdk/models/operations";

let value: Discount = {
  id: "<id>",
  coupon: {
    id: "<id>",
    name: "<value>",
    amountOff: 2514.64,
    percentageOff: 2981.87,
    durationInMonths: 9322.96,
    duration: "forever",
  },
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `id`                                                   | *string*                                               | :heavy_check_mark:                                     | N/A                                                    |
| `coupon`                                               | [operations.Coupon](../../models/operations/coupon.md) | :heavy_check_mark:                                     | N/A                                                    |