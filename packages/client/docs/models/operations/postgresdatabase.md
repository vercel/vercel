# PostgresDatabase

## Example Usage

```typescript
import { PostgresDatabase } from '@vercel/client/models/operations';

let value: PostgresDatabase = {
  price: 1644.88,
  batch: 8998.67,
  threshold: 7482.24,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                   | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsPostgresDatabaseMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemspostgresdatabasematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
