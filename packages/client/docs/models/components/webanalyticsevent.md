# WebAnalyticsEvent

## Example Usage

```typescript
import { WebAnalyticsEvent } from '@vercel/client/models/components';

let value: WebAnalyticsEvent = {
  price: 302.08,
  batch: 6.64,
  threshold: 9100.73,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                                                           | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserBillingInvoiceItemsWebAnalyticsEventMatrix](../../models/components/authuserbillinginvoiceitemswebanalyticseventmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                                                                       | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                                                                       | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                                                                       | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                                                                      | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                                                                       | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                                                                       | :heavy_minus_sign: | N/A         |
