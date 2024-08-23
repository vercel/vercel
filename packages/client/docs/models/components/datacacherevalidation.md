# DataCacheRevalidation

## Example Usage

```typescript
import { DataCacheRevalidation } from '@vercel/client/models/components';

let value: DataCacheRevalidation = {
  price: 1293.55,
  batch: 3503.25,
  threshold: 4714.57,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                   | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsDataCacheRevalidationMatrix](../../models/components/authuserbillinginvoiceitemsdatacacherevalidationmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                               | :heavy_minus_sign: | N/A         |
