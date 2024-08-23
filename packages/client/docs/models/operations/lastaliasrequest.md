# LastAliasRequest

## Example Usage

```typescript
import { LastAliasRequest } from '@vercel/client/models/operations';

let value: LastAliasRequest = {
  fromDeploymentId: '<value>',
  toDeploymentId: '<value>',
  jobStatus: 'failed',
  requestedAt: 5812.73,
  type: 'promote',
};
```

## Fields

| Field              | Type                                                                                                                                 | Required           | Description |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `fromDeploymentId` | _string_                                                                                                                             | :heavy_check_mark: | N/A         |
| `toDeploymentId`   | _string_                                                                                                                             | :heavy_check_mark: | N/A         |
| `jobStatus`        | [operations.JobStatus](../../models/operations/jobstatus.md)                                                                         | :heavy_check_mark: | N/A         |
| `requestedAt`      | _number_                                                                                                                             | :heavy_check_mark: | N/A         |
| `type`             | [operations.UpdateProjectDataCacheProjectsResponse200Type](../../models/operations/updateprojectdatacacheprojectsresponse200type.md) | :heavy_check_mark: | N/A         |
