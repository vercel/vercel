# ResponseBodyRecords

## Example Usage

```typescript
import { ResponseBodyRecords } from '@vercel/client/models/operations';

let value: ResponseBodyRecords = {
  id: '<id>',
  slug: '<value>',
  name: '<value>',
  type: 'TXT',
  value: '<value>',
  creator: '<value>',
  created: 8620.63,
  updated: 89.31,
  createdAt: 972.58,
  updatedAt: 902.33,
};
```

## Fields

| Field        | Type                                                                                                 | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`         | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `slug`       | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `type`       | [operations.GetRecordsResponseBodyDnsType](../../models/operations/getrecordsresponsebodydnstype.md) | :heavy_check_mark: | N/A         |
| `value`      | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `mxPriority` | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `priority`   | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `creator`    | _string_                                                                                             | :heavy_check_mark: | N/A         |
| `created`    | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `updated`    | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `createdAt`  | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `updatedAt`  | _number_                                                                                             | :heavy_check_mark: | N/A         |
