# PostgresDatabase

## Example Usage

```typescript
import { PostgresDatabase } from '@vercel/client/models/components';

let value: PostgresDatabase = {
  price: 4523.99,
  batch: 2327.72,
  threshold: 2006.37,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                         | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsPostgresDatabaseMatrix](../../models/components/authuserbillinginvoiceitemspostgresdatabasematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                    | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
