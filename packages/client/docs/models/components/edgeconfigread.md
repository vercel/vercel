# EdgeConfigRead

## Example Usage

```typescript
import { EdgeConfigRead } from '@vercel/client/models/components';

let value: EdgeConfigRead = {
  price: 9438.51,
  batch: 6444.79,
  threshold: 9649.25,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                     | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsEdgeConfigReadMatrix](../../models/components/authuserbillinginvoiceitemsedgeconfigreadmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                 | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                 | :heavy_minus_sign: | N/A         |
