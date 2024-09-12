# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from "@vercel/sdk/models/components";

let value: Subscriptions = {
  id: "<id>",
  trial: {
    start: 9979.18,
    end: 8611.23,
  },
  period: {
    start: 6711.16,
    end: 6176.57,
  },
  frequency: {
    interval: "year",
    intervalCount: 429.06,
  },
  discount: {
    id: "<id>",
    coupon: {
      id: "<id>",
      name: "<value>",
      amountOff: 3929.67,
      percentageOff: 7008.56,
      durationInMonths: 9248.4,
      duration: "once",
    },
  },
  items: [
    {
      id: "<id>",
      priceId: "<value>",
      productId: "<value>",
      amount: 2516.27,
      quantity: 5245.77,
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