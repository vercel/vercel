# FastDataTransfer

## Example Usage

```typescript
import { FastDataTransfer } from '@vercel/client/models/operations';

let value: FastDataTransfer = {
  price: 8667.89,
  batch: 9326.66,
  threshold: 6277.35,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                   | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsFastDataTransferMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsfastdatatransfermatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
