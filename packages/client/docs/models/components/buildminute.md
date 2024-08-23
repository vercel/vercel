# BuildMinute

## Example Usage

```typescript
import { BuildMinute } from '@vercel/client/models/components';

let value: BuildMinute = {
  price: 4904.2,
  batch: 8762.85,
  threshold: 1853.48,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                               | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsBuildMinuteMatrix](../../models/components/authuserbillinginvoiceitemsbuildminutematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                           | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                           | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                           | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                           | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                           | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                          | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                           | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                           | :heavy_minus_sign: | N/A         |
