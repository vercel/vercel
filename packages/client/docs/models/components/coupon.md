# Coupon

## Example Usage

```typescript
import { Coupon } from '@vercel/client/models/components';

let value: Coupon = {
  id: '<id>',
  name: '<value>',
  amountOff: 1089.03,
  percentageOff: 3979.88,
  durationInMonths: 2646.49,
  duration: 'once',
};
```

## Fields

| Field              | Type                                                       | Required           | Description |
| ------------------ | ---------------------------------------------------------- | ------------------ | ----------- |
| `id`               | _string_                                                   | :heavy_check_mark: | N/A         |
| `name`             | _string_                                                   | :heavy_check_mark: | N/A         |
| `amountOff`        | _number_                                                   | :heavy_check_mark: | N/A         |
| `percentageOff`    | _number_                                                   | :heavy_check_mark: | N/A         |
| `durationInMonths` | _number_                                                   | :heavy_check_mark: | N/A         |
| `duration`         | [components.Duration](../../models/components/duration.md) | :heavy_check_mark: | N/A         |
