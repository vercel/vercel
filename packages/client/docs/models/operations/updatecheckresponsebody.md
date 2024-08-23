# UpdateCheckResponseBody

## Example Usage

```typescript
import { UpdateCheckResponseBody } from '@vercel/client/models/operations';

let value: UpdateCheckResponseBody = {
  id: '<id>',
  name: '<value>',
  status: 'running',
  blocking: false,
  integrationId: '<value>',
  deploymentId: '<value>',
  createdAt: 4663.11,
  updatedAt: 4746.97,
};
```

## Fields

| Field           | Type                                                                                 | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`            | _string_                                                                             | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                             | :heavy_check_mark: | N/A         |
| `path`          | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `status`        | [operations.UpdateCheckStatus](../../models/operations/updatecheckstatus.md)         | :heavy_check_mark: | N/A         |
| `conclusion`    | [operations.UpdateCheckConclusion](../../models/operations/updatecheckconclusion.md) | :heavy_minus_sign: | N/A         |
| `blocking`      | _boolean_                                                                            | :heavy_check_mark: | N/A         |
| `output`        | [operations.UpdateCheckOutput](../../models/operations/updatecheckoutput.md)         | :heavy_minus_sign: | N/A         |
| `detailsUrl`    | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `integrationId` | _string_                                                                             | :heavy_check_mark: | N/A         |
| `deploymentId`  | _string_                                                                             | :heavy_check_mark: | N/A         |
| `externalId`    | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                             | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                             | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `completedAt`   | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `rerequestable` | _boolean_                                                                            | :heavy_minus_sign: | N/A         |
