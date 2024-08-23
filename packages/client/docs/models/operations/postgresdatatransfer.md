# PostgresDataTransfer

## Example Usage

```typescript
import { PostgresDataTransfer } from '@vercel/client/models/operations';

let value: PostgresDataTransfer = {
  price: 1753.72,
  batch: 7249.94,
  threshold: 1158.98,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                           | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsPostgresDataTransferMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemspostgresdatatransfermatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                                       | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                                       | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                                       | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                                      | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                                       | :heavy_minus_sign: | N/A         |
