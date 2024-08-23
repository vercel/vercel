# GetConfigurableLogDrainResponseBody

## Example Usage

```typescript
import { GetConfigurableLogDrainResponseBody } from '@vercel/client/models/operations';

let value: GetConfigurableLogDrainResponseBody = {
  id: '<id>',
  deliveryFormat: 'syslog',
  url: 'https://academic-officer.biz',
  name: '<value>',
  ownerId: '<value>',
  createdAt: 5790.11,
  deletedAt: 6128.67,
  updatedAt: 1700.99,
  environments: ['production'],
  secret: '<value>',
};
```

## Fields

| Field                 | Type                                                                                                                 | Required           | Description |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`                  | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `deliveryFormat`      | [operations.GetConfigurableLogDrainDeliveryFormat](../../models/operations/getconfigurablelogdraindeliveryformat.md) | :heavy_check_mark: | N/A         |
| `url`                 | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `name`                | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `clientId`            | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `configurationId`     | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `teamId`              | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `ownerId`             | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `projectIds`          | _string_[]                                                                                                           | :heavy_minus_sign: | N/A         |
| `createdAt`           | _number_                                                                                                             | :heavy_check_mark: | N/A         |
| `deletedAt`           | _number_                                                                                                             | :heavy_check_mark: | N/A         |
| `updatedAt`           | _number_                                                                                                             | :heavy_check_mark: | N/A         |
| `sources`             | [operations.GetConfigurableLogDrainSources](../../models/operations/getconfigurablelogdrainsources.md)[]             | :heavy_minus_sign: | N/A         |
| `headers`             | Record<string, _string_>                                                                                             | :heavy_minus_sign: | N/A         |
| `environments`        | [operations.GetConfigurableLogDrainEnvironments](../../models/operations/getconfigurablelogdrainenvironments.md)[]   | :heavy_check_mark: | N/A         |
| `status`              | [operations.GetConfigurableLogDrainStatus](../../models/operations/getconfigurablelogdrainstatus.md)                 | :heavy_minus_sign: | N/A         |
| `disabledAt`          | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `disabledReason`      | [operations.GetConfigurableLogDrainDisabledReason](../../models/operations/getconfigurablelogdraindisabledreason.md) | :heavy_minus_sign: | N/A         |
| `disabledBy`          | _string_                                                                                                             | :heavy_minus_sign: | N/A         |
| `firstErrorTimestamp` | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `samplingRate`        | _number_                                                                                                             | :heavy_minus_sign: | N/A         |
| `compression`         | [operations.Compression](../../models/operations/compression.md)                                                     | :heavy_minus_sign: | N/A         |
| `secret`              | _string_                                                                                                             | :heavy_check_mark: | N/A         |
| `createdFrom`         | [operations.GetConfigurableLogDrainCreatedFrom](../../models/operations/getconfigurablelogdraincreatedfrom.md)       | :heavy_minus_sign: | N/A         |
