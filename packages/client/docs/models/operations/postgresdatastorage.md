# PostgresDataStorage

## Example Usage

```typescript
import { PostgresDataStorage } from '@vercel/client/models/operations';

let value: PostgresDataStorage = {
  price: 9369.28,
  batch: 3344.74,
  threshold: 6592.68,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                         | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsPostgresDataStorageMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemspostgresdatastoragematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                                    | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
