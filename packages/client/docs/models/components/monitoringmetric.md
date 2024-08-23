# MonitoringMetric

## Example Usage

```typescript
import { MonitoringMetric } from '@vercel/client/models/components';

let value: MonitoringMetric = {
  price: 3306,
  batch: 9692.06,
  threshold: 662.07,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                         | Required           | Description |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsMonitoringMetricMatrix](../../models/components/authuserbillinginvoiceitemsmonitoringmetricmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                     | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                    | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                     | :heavy_minus_sign: | N/A         |
