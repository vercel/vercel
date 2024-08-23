# EdgeMiddlewareInvocations

## Example Usage

```typescript
import { EdgeMiddlewareInvocations } from '@vercel/client/models/components';

let value: EdgeMiddlewareInvocations = {
  price: 9211.93,
  batch: 2653.03,
  threshold: 4502.09,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                           | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsEdgeMiddlewareInvocationsMatrix](../../models/components/authuserbillinginvoiceitemsedgemiddlewareinvocationsmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                       | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                       | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                       | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                      | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                       | :heavy_minus_sign: | N/A         |
