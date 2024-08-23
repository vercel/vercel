# PostgresDataTransfer

## Example Usage

```typescript
import { PostgresDataTransfer } from '@vercel/client/models/components';

let value: PostgresDataTransfer = {
  price: 2561.14,
  batch: 6770.45,
  threshold: 8237.18,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                 | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsPostgresDataTransferMatrix](../../models/components/authuserbillinginvoiceitemspostgresdatatransfermatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                             | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                             | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                             | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                            | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                             | :heavy_minus_sign: | N/A         |
