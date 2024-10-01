# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from "@vercel/sdk/models/operations/createteam.js";

let value: Subscriptions = {
  id: "<id>",
  trial: {
    start: 8168.25,
    end: 5395.37,
  },
  period: {
    start: 458.50,
    end: 4638.95,
  },
  frequency: {
    interval: "week",
    intervalCount: 5383.68,
  },
  discount: {
    id: "<id>",
    coupon: {
      id: "<id>",
      name: "<value>",
      amountOff: 5724.50,
      percentageOff: 2247.77,
      durationInMonths: 8477.39,
      duration: "repeating",
    },
  },
  items: [
    {
      id: "<id>",
      priceId: "<id>",
      productId: "<id>",
      amount: 7132.46,
      quantity: 9818.64,
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