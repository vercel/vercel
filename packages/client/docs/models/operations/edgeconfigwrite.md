# EdgeConfigWrite

## Example Usage

```typescript
import { EdgeConfigWrite } from '@vercel/client/models/operations';

let value: EdgeConfigWrite = {
  price: 9974.37,
  batch: 8659.46,
  threshold: 3628.88,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                 | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsEdgeConfigWriteMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsedgeconfigwritematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                             | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                            | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                             | :heavy_minus_sign: | N/A         |
