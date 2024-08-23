# DataCacheRead

## Example Usage

```typescript
import { DataCacheRead } from '@vercel/client/models/components';

let value: DataCacheRead = {
  price: 2323.83,
  batch: 9958.16,
  threshold: 1286.96,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                   | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsDataCacheReadMatrix](../../models/components/authuserbillinginvoiceitemsdatacachereadmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                               | :heavy_minus_sign: | N/A         |
