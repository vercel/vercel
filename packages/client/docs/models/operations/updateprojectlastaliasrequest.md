# UpdateProjectLastAliasRequest

## Example Usage

```typescript
import { UpdateProjectLastAliasRequest } from '@vercel/client/models/operations';

let value: UpdateProjectLastAliasRequest = {
  fromDeploymentId: '<value>',
  toDeploymentId: '<value>',
  jobStatus: 'pending',
  requestedAt: 333.04,
  type: 'promote',
};
```

## Fields

| Field              | Type                                                                                                               | Required           | Description |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `fromDeploymentId` | _string_                                                                                                           | :heavy_check_mark: | N/A         |
| `toDeploymentId`   | _string_                                                                                                           | :heavy_check_mark: | N/A         |
| `jobStatus`        | [operations.UpdateProjectJobStatus](../../models/operations/updateprojectjobstatus.md)                             | :heavy_check_mark: | N/A         |
| `requestedAt`      | _number_                                                                                                           | :heavy_check_mark: | N/A         |
| `type`             | [operations.UpdateProjectProjectsResponse200Type](../../models/operations/updateprojectprojectsresponse200type.md) | :heavy_check_mark: | N/A         |
