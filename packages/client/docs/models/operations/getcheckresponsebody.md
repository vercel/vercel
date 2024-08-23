# GetCheckResponseBody

## Example Usage

```typescript
import { GetCheckResponseBody } from '@vercel/client/models/operations';

let value: GetCheckResponseBody = {
  id: '<id>',
  name: '<value>',
  status: 'registered',
  blocking: false,
  integrationId: '<value>',
  deploymentId: '<value>',
  createdAt: 5701.97,
  updatedAt: 384.25,
};
```

## Fields

| Field           | Type                                                                           | Required           | Description |
| --------------- | ------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`            | _string_                                                                       | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                       | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                       | :heavy_minus_sign: | N/A         |
| `status`        | [operations.GetCheckStatus](../../models/operations/getcheckstatus.md)         | :heavy_check_mark: | N/A         |
| `conclusion`    | [operations.GetCheckConclusion](../../models/operations/getcheckconclusion.md) | :heavy_minus_sign: | N/A         |
| `blocking`      | _boolean_                                                                      | :heavy_check_mark: | N/A         |
| `output`        | [operations.GetCheckOutput](../../models/operations/getcheckoutput.md)         | :heavy_minus_sign: | N/A         |
| `detailsUrl`    | _string_                                                                       | :heavy_minus_sign: | N/A         |
| `integrationId` | _string_                                                                       | :heavy_check_mark: | N/A         |
| `deploymentId`  | _string_                                                                       | :heavy_check_mark: | N/A         |
| `externalId`    | _string_                                                                       | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                       | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                       | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_                                                                       | :heavy_minus_sign: | N/A         |
| `completedAt`   | _number_                                                                       | :heavy_minus_sign: | N/A         |
| `rerequestable` | _boolean_                                                                      | :heavy_minus_sign: | N/A         |
