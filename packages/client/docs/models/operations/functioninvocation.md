# FunctionInvocation

## Example Usage

```typescript
import { FunctionInvocation } from '@vercel/client/models/operations';

let value: FunctionInvocation = {
  price: 6972.74,
  batch: 3481.92,
  threshold: 4633.44,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                       | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsFunctionInvocationMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsfunctioninvocationmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                                   | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                                   | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                                   | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                                  | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                                   | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                                   | :heavy_minus_sign: | N/A         |
