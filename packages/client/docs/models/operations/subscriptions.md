# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from '@vercel/client/models/operations';

let value: Subscriptions = {
  id: '<id>',
  trial: {
    start: 8200.23,
    end: 2514.64,
  },
  period: {
    start: 2981.87,
    end: 9322.96,
  },
  frequency: {
    interval: 'month',
    intervalCount: 9930.02,
  },
  discount: {
    id: '<id>',
    coupon: {
      id: '<id>',
      name: '<value>',
      amountOff: 3302.67,
      percentageOff: 1645.32,
      durationInMonths: 8138.8,
      duration: 'repeating',
    },
  },
  items: [
    {
      id: '<id>',
      priceId: '<value>',
      productId: '<value>',
      amount: 1403.84,
      quantity: 8634.77,
    },
  ],
};
```

## Fields

| Field       | Type                                                                       | Required           | Description |
| ----------- | -------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`        | _string_                                                                   | :heavy_check_mark: | N/A         |
| `trial`     | [operations.CreateTeamTrial](../../models/operations/createteamtrial.md)   | :heavy_check_mark: | N/A         |
| `period`    | [operations.CreateTeamPeriod](../../models/operations/createteamperiod.md) | :heavy_check_mark: | N/A         |
| `frequency` | [operations.Frequency](../../models/operations/frequency.md)               | :heavy_check_mark: | N/A         |
| `discount`  | [operations.Discount](../../models/operations/discount.md)                 | :heavy_check_mark: | N/A         |
| `items`     | [operations.CreateTeamItems](../../models/operations/createteamitems.md)[] | :heavy_check_mark: | N/A         |
