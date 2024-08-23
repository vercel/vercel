# GetAllLogDrainsResponseBody

## Example Usage

```typescript
import { GetAllLogDrainsResponseBody } from '@vercel/client/models/operations';

let value: GetAllLogDrainsResponseBody = {
  id: '<id>',
  deliveryFormat: 'json',
  url: 'https://sticky-electronics.org',
  name: '<value>',
  ownerId: '<value>',
  createdAt: 5495.01,
  deletedAt: 4152.8,
  updatedAt: 9308.19,
  environments: ['production'],
  secret: '<value>',
};
```

## Fields

| Field                 | Type                                                                                                 | Required           | Description |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`                  | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `deliveryFormat`      | [operations.GetAllLogDrainsDeliveryFormat](../../models/operations/getalllogdrainsdeliveryformat.md) | :heavy_check_mark: | N/A         |
| `url`                 | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `name`                | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `clientId`            | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `configurationId`     | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `teamId`              | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `ownerId`             | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `projectIds`          | _string_[]                                                                                           | :heavy_minus_sign: | N/A         |
| `createdAt`           | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `deletedAt`           | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `updatedAt`           | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `sources`             | [operations.GetAllLogDrainsSources](../../models/operations/getalllogdrainssources.md)[]             | :heavy_minus_sign: | N/A         |
| `headers`             | Record<string, _string_>                                                                             | :heavy_minus_sign: | N/A         |
| `environments`        | [operations.GetAllLogDrainsEnvironments](../../models/operations/getalllogdrainsenvironments.md)[]   | :heavy_check_mark: | N/A         |
| `status`              | [operations.GetAllLogDrainsStatus](../../models/operations/getalllogdrainsstatus.md)                 | :heavy_minus_sign: | N/A         |
| `disabledAt`          | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `disabledReason`      | [operations.GetAllLogDrainsDisabledReason](../../models/operations/getalllogdrainsdisabledreason.md) | :heavy_minus_sign: | N/A         |
| `disabledBy`          | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `firstErrorTimestamp` | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `samplingRate`        | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `compression`         | [operations.GetAllLogDrainsCompression](../../models/operations/getalllogdrainscompression.md)       | :heavy_minus_sign: | N/A         |
| `secret`              | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `createdFrom`         | [operations.GetAllLogDrainsCreatedFrom](../../models/operations/getalllogdrainscreatedfrom.md)       | :heavy_minus_sign: | N/A         |
