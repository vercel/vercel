# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from "@vercel/sdk/models/components/authuser.js";

let value: Subscriptions = {
  id: "<id>",
  trial: {
    start: 9961.00,
    end: 2322.10,
  },
  period: {
    start: 3534.24,
    end: 2628.91,
  },
  frequency: {
    interval: "day",
    intervalCount: 1008.05,
  },
  discount: {
    id: "<id>",
    coupon: {
      id: "<id>",
      name: "<value>",
      amountOff: 3598.10,
      percentageOff: 8878.65,
      durationInMonths: 2985.90,
      duration: "repeating",
    },
  },
  items: [
    {
      id: "<id>",
      priceId: "<value>",
      productId: "<value>",
      amount: 9444.74,
      quantity: 7283.79,
    },
  ],
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                                                                   | *string*                                                               | :heavy_check_mark:                                                     | N/A                                                                    |
| `trial`                                                                | [components.AuthUserTrial](../../models/components/authusertrial.md)   | :heavy_check_mark:                                                     | N/A                                                                    |
| `period`                                                               | [components.AuthUserPeriod](../../models/components/authuserperiod.md) | :heavy_check_mark:                                                     | N/A                                                                    |
| `frequency`                                                            | [components.Frequency](../../models/components/frequency.md)           | :heavy_check_mark:                                                     | N/A                                                                    |
| `discount`                                                             | [components.Discount](../../models/components/discount.md)             | :heavy_check_mark:                                                     | N/A                                                                    |
| `items`                                                                | [components.Items](../../models/components/items.md)[]                 | :heavy_check_mark:                                                     | N/A                                                                    |