# DataCacheWrite

## Example Usage

```typescript
import { DataCacheWrite } from '@vercel/client/models/components';

let value: DataCacheWrite = {
  price: 2527,
  batch: 680.93,
  threshold: 727.54,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                     | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsDataCacheWriteMatrix](../../models/components/authuserbillinginvoiceitemsdatacachewritematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
