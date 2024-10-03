# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from "@vercel/sdk/models/components/authuser.js";

let value: Subscriptions = {
  id: "<id>",
  trial: {
    start: 9390.78,
    end: 2223.73,
  },
  period: {
    start: 5535.42,
    end: 544.98,
  },
  frequency: {
    interval: "month",
    intervalCount: 6040.27,
  },
  discount: {
    id: "<id>",
    coupon: {
      id: "<id>",
      name: "<value>",
      amountOff: 6621.84,
      percentageOff: 5809.96,
      durationInMonths: 8696.01,
      duration: "once",
    },
  },
  items: [
    {
      id: "<id>",
      priceId: "<id>",
      productId: "<id>",
      amount: 7638.62,
      quantity: 4650.92,
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