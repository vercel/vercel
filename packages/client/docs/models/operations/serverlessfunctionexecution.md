# ServerlessFunctionExecution

## Example Usage

```typescript
import { ServerlessFunctionExecution } from '@vercel/client/models/operations';

let value: ServerlessFunctionExecution = {
  price: 873.82,
  batch: 964.5,
  threshold: 3864.47,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                                         | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsServerlessFunctionExecutionMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsserverlessfunctionexecutionmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                                                     | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                                                    | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                                                     | :heavy_minus_sign: | N/A         |
