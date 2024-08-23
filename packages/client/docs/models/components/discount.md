# Discount

## Example Usage

```typescript
import { Discount } from '@vercel/client/models/components';

let value: Discount = {
  id: '<id>',
  coupon: {
    id: '<id>',
    name: '<value>',
    amountOff: 9750.95,
    percentageOff: 5629.48,
    durationInMonths: 6394.63,
    duration: 'once',
  },
};
```

## Fields

| Field    | Type                                                   | Required           | Description |
| -------- | ------------------------------------------------------ | ------------------ | ----------- |
| `id`     | _string_                                               | :heavy_check_mark: | N/A         |
| `coupon` | [components.Coupon](../../models/components/coupon.md) | :heavy_check_mark: | N/A         |
