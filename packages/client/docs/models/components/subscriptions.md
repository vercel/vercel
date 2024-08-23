# Subscriptions

## Example Usage

```typescript
import { Subscriptions } from '@vercel/client/models/components';

let value: Subscriptions = {
  id: '<id>',
  trial: {
    start: 3979.19,
    end: 4120.52,
  },
  period: {
    start: 7745.01,
    end: 4983.88,
  },
  frequency: {
    interval: 'month',
    intervalCount: 2436.23,
  },
  discount: {
    id: '<id>',
    coupon: {
      id: '<id>',
      name: '<value>',
      amountOff: 9673.38,
      percentageOff: 9979.18,
      durationInMonths: 8611.23,
      duration: 'once',
    },
  },
  items: [
    {
      id: '<id>',
      priceId: '<value>',
      productId: '<value>',
      amount: 6176.57,
      quantity: 8837.8,
    },
  ],
};
```

## Fields

| Field       | Type                                                                   | Required           | Description |
| ----------- | ---------------------------------------------------------------------- | ------------------ | ----------- |
| `id`        | _string_                                                               | :heavy_check_mark: | N/A         |
| `trial`     | [components.AuthUserTrial](../../models/components/authusertrial.md)   | :heavy_check_mark: | N/A         |
| `period`    | [components.AuthUserPeriod](../../models/components/authuserperiod.md) | :heavy_check_mark: | N/A         |
| `frequency` | [components.Frequency](../../models/components/frequency.md)           | :heavy_check_mark: | N/A         |
| `discount`  | [components.Discount](../../models/components/discount.md)             | :heavy_check_mark: | N/A         |
| `items`     | [components.Items](../../models/components/items.md)[]                 | :heavy_check_mark: | N/A         |
