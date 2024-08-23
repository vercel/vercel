# CreateCheckResponseBody

## Example Usage

```typescript
import { CreateCheckResponseBody } from '@vercel/client/models/operations';

let value: CreateCheckResponseBody = {
  id: '<id>',
  name: '<value>',
  status: 'registered',
  blocking: false,
  integrationId: '<value>',
  deploymentId: '<value>',
  createdAt: 3241.41,
  updatedAt: 6176.36,
};
```

## Fields

| Field           | Type                                                                                 | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`            | _string_                                                                             | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                             | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `status`        | [operations.CreateCheckStatus](../../models/operations/createcheckstatus.md)         | :heavy_check_mark: | N/A         |
| `conclusion`    | [operations.CreateCheckConclusion](../../models/operations/createcheckconclusion.md) | :heavy_minus_sign: | N/A         |
| `blocking`      | _boolean_                                                                            | :heavy_check_mark: | N/A         |
| `output`        | [operations.CreateCheckOutput](../../models/operations/createcheckoutput.md)         | :heavy_minus_sign: | N/A         |
| `detailsUrl`    | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `integrationId` | _string_                                                                             | :heavy_check_mark: | N/A         |
| `deploymentId`  | _string_                                                                             | :heavy_check_mark: | N/A         |
| `externalId`    | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                             | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                             | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `completedAt`   | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `rerequestable` | _boolean_                                                                            | :heavy_minus_sign: | N/A         |
