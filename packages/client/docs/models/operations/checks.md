# Checks

## Example Usage

```typescript
import { Checks } from '@vercel/client/models/operations';

let value: Checks = {
  createdAt: 4370.32,
  id: '<id>',
  integrationId: '<value>',
  name: '<value>',
  rerequestable: false,
  status: 'completed',
  updatedAt: 6976.31,
};
```

## Fields

| Field           | Type                                                                                   | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `completedAt`   | _number_                                                                               | :heavy_minus_sign: | N/A         |
| `conclusion`    | [operations.GetAllChecksConclusion](../../models/operations/getallchecksconclusion.md) | :heavy_minus_sign: | N/A         |
| `createdAt`     | _number_                                                                               | :heavy_check_mark: | N/A         |
| `detailsUrl`    | _string_                                                                               | :heavy_minus_sign: | N/A         |
| `id`            | _string_                                                                               | :heavy_check_mark: | N/A         |
| `integrationId` | _string_                                                                               | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                               | :heavy_check_mark: | N/A         |
| `output`        | [operations.GetAllChecksOutput](../../models/operations/getallchecksoutput.md)         | :heavy_minus_sign: | N/A         |
| `path`          | _string_                                                                               | :heavy_minus_sign: | N/A         |
| `rerequestable` | _boolean_                                                                              | :heavy_check_mark: | N/A         |
| `startedAt`     | _number_                                                                               | :heavy_minus_sign: | N/A         |
| `status`        | [operations.GetAllChecksStatus](../../models/operations/getallchecksstatus.md)         | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                               | :heavy_check_mark: | N/A         |
