# MonitoringMetric

## Example Usage

```typescript
import { MonitoringMetric } from '@vercel/client/models/operations';

let value: MonitoringMetric = {
  price: 5755.34,
  batch: 8760.27,
  threshold: 1949.01,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                                                                                                                   | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponse200ApplicationJSONResponseBodyBillingInvoiceItemsMonitoringMetricMatrix](../../models/operations/createteamteamsresponse200applicationjsonresponsebodybillinginvoiceitemsmonitoringmetricmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                                                                                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                                                                                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                                                                                                               | :heavy_minus_sign: | N/A         |
