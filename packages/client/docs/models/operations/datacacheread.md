# DataCacheRead

## Example Usage

```typescript
import { DataCacheRead } from '@vercel/client/models/operations';

let value: DataCacheRead = {
  price: 3759.94,
  batch: 7791.8,
  threshold: 2420.99,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                             | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsDataCacheReadMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsdatacachereadmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                         | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                         | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                         | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                        | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                         | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                         | :heavy_minus_sign: | N/A         |
