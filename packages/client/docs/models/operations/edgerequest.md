# EdgeRequest

## Example Usage

```typescript
import { EdgeRequest } from '@vercel/client/models/operations';

let value: EdgeRequest = {
  price: 5678.46,
  batch: 1721.95,
  threshold: 6211.69,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                         | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsEdgeRequestMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsedgerequestmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                    | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
