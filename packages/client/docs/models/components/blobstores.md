# BlobStores

## Example Usage

```typescript
import { BlobStores } from '@vercel/client/models/components';

let value: BlobStores = {
  price: 2313.82,
  batch: 7532.4,
  threshold: 4901.1,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                         | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsMatrix](../../models/components/authuserbillinginvoiceitemsmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                     | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                     | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                     | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                     | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                     | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                    | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                     | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                     | :heavy_minus_sign: | N/A         |
