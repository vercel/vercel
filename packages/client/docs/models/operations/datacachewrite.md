# DataCacheWrite

## Example Usage

```typescript
import { DataCacheWrite } from '@vercel/client/models/operations';

let value: DataCacheWrite = {
  price: 6692.37,
  batch: 7708.73,
  threshold: 9637.41,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                               | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsDataCacheWriteMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsdatacachewritematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                           | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                           | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                           | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                          | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                           | :heavy_minus_sign: | N/A         |
