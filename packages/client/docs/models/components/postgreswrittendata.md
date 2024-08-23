# PostgresWrittenData

## Example Usage

```typescript
import { PostgresWrittenData } from '@vercel/client/models/components';

let value: PostgresWrittenData = {
  price: 3106.29,
  batch: 9294.76,
  threshold: 7912.28,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                               | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsPostgresWrittenDataMatrix](../../models/components/authuserbillinginvoiceitemspostgreswrittendatamatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                           | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                           | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                           | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                          | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                           | :heavy_minus_sign: | N/A         |
