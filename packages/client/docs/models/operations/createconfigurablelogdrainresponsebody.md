# CreateConfigurableLogDrainResponseBody

## Example Usage

```typescript
import { CreateConfigurableLogDrainResponseBody } from '@vercel/client/models/operations';

let value: CreateConfigurableLogDrainResponseBody = {
  id: '<id>',
  deliveryFormat: 'ndjson',
  url: 'https://glittering-molar.org',
  name: '<value>',
  ownerId: '<value>',
  createdAt: 7746.84,
  deletedAt: 9450.27,
  updatedAt: 9001.03,
  environments: ['preview'],
};
```

## Fields

| Field                 | Type                                                                                                                                         | Required           | Description                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| `secret`              | _string_                                                                                                                                     | :heavy_minus_sign: | The secret to validate the log-drain payload |
| `id`                  | _string_                                                                                                                                     | :heavy_check_mark: | N/A                                          |
| `deliveryFormat`      | [operations.CreateConfigurableLogDrainLogDrainsDeliveryFormat](../../models/operations/createconfigurablelogdrainlogdrainsdeliveryformat.md) | :heavy_check_mark: | N/A                                          |
| `url`                 | _string_                                                                                                                                     | :heavy_check_mark: | N/A                                          |
| `name`                | _string_                                                                                                                                     | :heavy_check_mark: | N/A                                          |
| `clientId`            | _string_                                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `configurationId`     | _string_                                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `teamId`              | _string_                                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `ownerId`             | _string_                                                                                                                                     | :heavy_check_mark: | N/A                                          |
| `projectIds`          | _string_[]                                                                                                                                   | :heavy_minus_sign: | N/A                                          |
| `createdAt`           | _number_                                                                                                                                     | :heavy_check_mark: | N/A                                          |
| `deletedAt`           | _number_                                                                                                                                     | :heavy_check_mark: | N/A                                          |
| `updatedAt`           | _number_                                                                                                                                     | :heavy_check_mark: | N/A                                          |
| `sources`             | [operations.CreateConfigurableLogDrainLogDrainsSources](../../models/operations/createconfigurablelogdrainlogdrainssources.md)[]             | :heavy_minus_sign: | N/A                                          |
| `headers`             | Record<string, _string_>                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `environments`        | [operations.CreateConfigurableLogDrainLogDrainsEnvironments](../../models/operations/createconfigurablelogdrainlogdrainsenvironments.md)[]   | :heavy_check_mark: | N/A                                          |
| `status`              | [operations.CreateConfigurableLogDrainStatus](../../models/operations/createconfigurablelogdrainstatus.md)                                   | :heavy_minus_sign: | N/A                                          |
| `disabledAt`          | _number_                                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `disabledReason`      | [operations.CreateConfigurableLogDrainDisabledReason](../../models/operations/createconfigurablelogdraindisabledreason.md)                   | :heavy_minus_sign: | N/A                                          |
| `disabledBy`          | _string_                                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `firstErrorTimestamp` | _number_                                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `samplingRate`        | _number_                                                                                                                                     | :heavy_minus_sign: | N/A                                          |
| `compression`         | [operations.CreateConfigurableLogDrainCompression](../../models/operations/createconfigurablelogdraincompression.md)                         | :heavy_minus_sign: | N/A                                          |
| `createdFrom`         | [operations.CreateConfigurableLogDrainCreatedFrom](../../models/operations/createconfigurablelogdraincreatedfrom.md)                         | :heavy_minus_sign: | N/A                                          |
