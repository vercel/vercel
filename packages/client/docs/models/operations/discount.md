# Discount

## Example Usage

```typescript
import { Discount } from '@vercel/client/models/operations';

let value: Discount = {
  id: '<id>',
  coupon: {
    id: '<id>',
    name: '<value>',
    amountOff: 3330.72,
    percentageOff: 7274.81,
    durationInMonths: 997.33,
    duration: 'repeating',
  },
};
```

## Fields

| Field    | Type                                                   | Required           | Description |
| -------- | ------------------------------------------------------ | ------------------ | ----------- |
| `id`     | _string_                                               | :heavy_check_mark: | N/A         |
| `coupon` | [operations.Coupon](../../models/operations/coupon.md) | :heavy_check_mark: | N/A         |
