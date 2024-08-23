# CreateProjectLastAliasRequest

## Example Usage

```typescript
import { CreateProjectLastAliasRequest } from '@vercel/client/models/operations';

let value: CreateProjectLastAliasRequest = {
  fromDeploymentId: '<value>',
  toDeploymentId: '<value>',
  jobStatus: 'pending',
  requestedAt: 9065.56,
  type: 'promote',
};
```

## Fields

| Field              | Type                                                                                                                                                                     | Required           | Description |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `fromDeploymentId` | _string_                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `toDeploymentId`   | _string_                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `jobStatus`        | [operations.CreateProjectJobStatus](../../models/operations/createprojectjobstatus.md)                                                                                   | :heavy_check_mark: | N/A         |
| `requestedAt`      | _number_                                                                                                                                                                 | :heavy_check_mark: | N/A         |
| `type`             | [operations.CreateProjectProjectsResponse200ApplicationJSONResponseBodyType](../../models/operations/createprojectprojectsresponse200applicationjsonresponsebodytype.md) | :heavy_check_mark: | N/A         |
