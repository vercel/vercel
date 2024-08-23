# PostgresWrittenData

## Example Usage

```typescript
import { PostgresWrittenData } from '@vercel/client/models/operations';

let value: PostgresWrittenData = {
  price: 568.77,
  batch: 4973.57,
  threshold: 9804.86,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                         | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsPostgresWrittenDataMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemspostgreswrittendatamatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                                    | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
