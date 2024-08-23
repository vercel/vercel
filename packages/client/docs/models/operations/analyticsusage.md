# AnalyticsUsage

## Example Usage

```typescript
import { AnalyticsUsage } from '@vercel/client/models/operations';

let value: AnalyticsUsage = {
  price: 4918.92,
  batch: 7607.44,
  threshold: 8989.61,
  hidden: false,
};
```

## Fields

| Field        | Type                                                   | Required           | Description |
| ------------ | ------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [operations.Matrix](../../models/operations/matrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                               | :heavy_minus_sign: | N/A         |
