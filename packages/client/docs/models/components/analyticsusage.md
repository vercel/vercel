# AnalyticsUsage

## Example Usage

```typescript
import { AnalyticsUsage } from '@vercel/client/models/components';

let value: AnalyticsUsage = {
  price: 209.5,
  batch: 6985.58,
  threshold: 4116.15,
  hidden: false,
};
```

## Fields

| Field        | Type                                                   | Required           | Description |
| ------------ | ------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [components.Matrix](../../models/components/matrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                               | :heavy_minus_sign: | N/A         |
