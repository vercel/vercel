# PostgresDataStorage

## Example Usage

```typescript
import { PostgresDataStorage } from '@vercel/client/models/components';

let value: PostgresDataStorage = {
  price: 9116.57,
  batch: 4837.53,
  threshold: 4137.58,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                               | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsPostgresDataStorageMatrix](../../models/components/authuserbillinginvoiceitemspostgresdatastoragematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                           | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                           | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                           | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                          | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                           | :heavy_minus_sign: | N/A         |
