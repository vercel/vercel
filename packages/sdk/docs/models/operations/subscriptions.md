# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from "@vercel/sdk/models/operations/createteam.js";

let value: Subscriptions = {
  id: "<id>",
  trial: {
    start: 2528.54,
    end: 7578.24,
  },
  period: {
    start: 0.74,
    end: 2542.40,
  },
  frequency: {
    interval: "week",
    intervalCount: 5323.36,
  },
  discount: {
    id: "<id>",
    coupon: {
      id: "<id>",
      name: "<value>",
      amountOff: 1149.52,
      percentageOff: 3936.30,
      durationInMonths: 3755.49,
      duration: "repeating",
    },
  },
  items: [
    {
      id: "<id>",
      priceId: "<value>",
      productId: "<value>",
      amount: 6679.77,
      quantity: 8408.30,
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