# Pro

Will be used to create an invoice item. The price must be in cents: 2000 for $20.

## Example Usage

```typescript
import { Pro } from '@vercel/client/models/operations';

let value: Pro = {
  price: 7029.52,
  quantity: 5156.38,
  hidden: false,
};
```

## Fields

| Field             | Type                                                                                                                                                                                                               | Required           | Description                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `tier`            | _number_                                                                                                                                                                                                           | :heavy_minus_sign: | N/A                                                                                                   |
| `price`           | _number_                                                                                                                                                                                                           | :heavy_check_mark: | N/A                                                                                                   |
| `quantity`        | _number_                                                                                                                                                                                                           | :heavy_check_mark: | N/A                                                                                                   |
| `highestQuantity` | _number_                                                                                                                                                                                                           | :heavy_minus_sign: | The highest quantity in the current period. Used to render the correct enable/disable UI for add-ons. |
| `name`            | _string_                                                                                                                                                                                                           | :heavy_minus_sign: | N/A                                                                                                   |
| `hidden`          | _boolean_                                                                                                                                                                                                          | :heavy_check_mark: | N/A                                                                                                   |
| `createdAt`       | _number_                                                                                                                                                                                                           | :heavy_minus_sign: | N/A                                                                                                   |
| `disabledAt`      | _number_                                                                                                                                                                                                           | :heavy_minus_sign: | N/A                                                                                                   |
| `frequency`       | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsProFrequency](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsprofrequency.md) | :heavy_minus_sign: | N/A                                                                                                   |
| `maxQuantity`     | _number_                                                                                                                                                                                                           | :heavy_minus_sign: | N/A                                                                                                   |
