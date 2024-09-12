# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from "@vercel/sdk/models/operations";

let value: Subscriptions = {
  id: "<id>",
  trial: {
    start: 1645.32,
    end: 8138.8,
  },
  period: {
    start: 5129.05,
    end: 1403.84,
  },
  frequency: {
    interval: "year",
    intervalCount: 2273.62,
  },
  discount: {
    id: "<id>",
    coupon: {
      id: "<id>",
      name: "<value>",
      amountOff: 3476.98,
      percentageOff: 688.52,
      durationInMonths: 2426.37,
      duration: "once",
    },
  },
  items: [
    {
      id: "<id>",
      priceId: "<value>",
      productId: "<value>",
      amount: 7310.65,
      quantity: 3952.33,
    },
  ],
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`                                                                       | *string*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `trial`                                                                    | [operations.CreateTeamTrial](../../models/operations/createteamtrial.md)   | :heavy_check_mark:                                                         | N/A                                                                        |
| `period`                                                                   | [operations.CreateTeamPeriod](../../models/operations/createteamperiod.md) | :heavy_check_mark:                                                         | N/A                                                                        |
| `frequency`                                                                | [operations.Frequency](../../models/operations/frequency.md)               | :heavy_check_mark:                                                         | N/A                                                                        |
| `discount`                                                                 | [operations.Discount](../../models/operations/discount.md)                 | :heavy_check_mark:                                                         | N/A                                                                        |
| `items`                                                                    | [operations.CreateTeamItems](../../models/operations/createteamitems.md)[] | :heavy_check_mark:                                                         | N/A                                                                        |