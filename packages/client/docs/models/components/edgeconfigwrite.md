# EdgeConfigWrite

## Example Usage

```typescript
import { EdgeConfigWrite } from '@vercel/client/models/components';

let value: EdgeConfigWrite = {
  price: 2512.12,
  batch: 7193.89,
  threshold: 4502.24,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                       | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsEdgeConfigWriteMatrix](../../models/components/authuserbillinginvoiceitemsedgeconfigwritematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                   | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                  | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                   | :heavy_minus_sign: | N/A         |
