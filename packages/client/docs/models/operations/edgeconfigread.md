# EdgeConfigRead

## Example Usage

```typescript
import { EdgeConfigRead } from '@vercel/client/models/operations';

let value: EdgeConfigRead = {
  price: 7358.94,
  batch: 8786.01,
  threshold: 1415.06,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                               | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsEdgeConfigReadMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsedgeconfigreadmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                           | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                           | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                           | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                          | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
