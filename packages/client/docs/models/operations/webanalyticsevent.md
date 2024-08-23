# WebAnalyticsEvent

## Example Usage

```typescript
import { WebAnalyticsEvent } from '@vercel/client/models/operations';

let value: WebAnalyticsEvent = {
  price: 6144.38,
  batch: 8268.62,
  threshold: 7316.34,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                     | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsWebAnalyticsEventMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemswebanalyticseventmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                                | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                                 | :heavy_minus_sign: | N/A         |
