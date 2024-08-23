# Records

## Example Usage

```typescript
import { Records } from '@vercel/client/models/operations';

let value: Records = {
  id: '<id>',
  slug: '<value>',
  name: '<value>',
  type: 'AAAA',
  value: '<value>',
  creator: '<value>',
  created: 9849.34,
  updated: 8595.81,
  createdAt: 8965.82,
  updatedAt: 585.34,
};
```

## Fields

| Field        | Type                                                                                           | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `id`         | _string_                                                                                       | :heavy_check_mark: | N/A         |
| `slug`       | _string_                                                                                       | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                       | :heavy_check_mark: | N/A         |
| `type`       | [operations.GetRecordsResponseBodyType](../../models/operations/getrecordsresponsebodytype.md) | :heavy_check_mark: | N/A         |
| `value`      | _string_                                                                                       | :heavy_check_mark: | N/A         |
| `mxPriority` | _number_                                                                                       | :heavy_minus_sign: | N/A         |
| `priority`   | _number_                                                                                       | :heavy_minus_sign: | N/A         |
| `creator`    | _string_                                                                                       | :heavy_check_mark: | N/A         |
| `created`    | _number_                                                                                       | :heavy_check_mark: | N/A         |
| `updated`    | _number_                                                                                       | :heavy_check_mark: | N/A         |
| `createdAt`  | _number_                                                                                       | :heavy_check_mark: | N/A         |
| `updatedAt`  | _number_                                                                                       | :heavy_check_mark: | N/A         |
