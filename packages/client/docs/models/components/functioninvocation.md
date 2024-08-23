# FunctionInvocation

## Example Usage

```typescript
import { FunctionInvocation } from '@vercel/client/models/components';

let value: FunctionInvocation = {
  price: 1995.29,
  batch: 6521.25,
  threshold: 4926.32,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                             | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsFunctionInvocationMatrix](../../models/components/authuserbillinginvoiceitemsfunctioninvocationmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                         | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                        | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                         | :heavy_minus_sign: | N/A         |
