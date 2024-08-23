# GetProjectsLastAliasRequest

## Example Usage

```typescript
import { GetProjectsLastAliasRequest } from '@vercel/client/models/operations';

let value: GetProjectsLastAliasRequest = {
  fromDeploymentId: '<value>',
  toDeploymentId: '<value>',
  jobStatus: 'succeeded',
  requestedAt: 7438.35,
  type: 'rollback',
};
```

## Fields

| Field              | Type                                                                                                           | Required           | Description |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `fromDeploymentId` | _string_                                                                                                       | :heavy_check_mark: | N/A         |
| `toDeploymentId`   | _string_                                                                                                       | :heavy_check_mark: | N/A         |
| `jobStatus`        | [operations.GetProjectsJobStatus](../../models/operations/getprojectsjobstatus.md)                             | :heavy_check_mark: | N/A         |
| `requestedAt`      | _number_                                                                                                       | :heavy_check_mark: | N/A         |
| `type`             | [operations.GetProjectsProjectsResponse200Type](../../models/operations/getprojectsprojectsresponse200type.md) | :heavy_check_mark: | N/A         |
