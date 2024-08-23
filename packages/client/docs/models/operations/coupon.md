# Coupon

## Example Usage

```typescript
import { Coupon } from '@vercel/client/models/operations';

let value: Coupon = {
  id: '<id>',
  name: '<value>',
  amountOff: 9031.5,
  percentageOff: 6444.2,
  durationInMonths: 429.24,
  duration: 'repeating',
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
| `duration`         | [operations.Duration](../../models/operations/duration.md) | :heavy_check_mark: | N/A         |
