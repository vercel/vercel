# LastAliasRequest

## Example Usage

```typescript
import { LastAliasRequest } from "@vercel/sdk/models/operations/updateprojectdatacache.js";

let value: LastAliasRequest = {
  fromDeploymentId: "<id>",
  toDeploymentId: "<id>",
  jobStatus: "failed",
  requestedAt: 9404.32,
  type: "rollback",
};
```

## Fields

| Field                                                                                                                          | Type                                                                                                                           | Required                                                                                                                       | Description                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `fromDeploymentId`                                                                                                             | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `toDeploymentId`                                                                                                               | *string*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `jobStatus`                                                                                                                    | [operations.JobStatus](../../models/operations/jobstatus.md)                                                                   | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `requestedAt`                                                                                                                  | *number*                                                                                                                       | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |
| `type`                                                                                                                         | [operations.UpdateProjectDataCacheProjectsResponseType](../../models/operations/updateprojectdatacacheprojectsresponsetype.md) | :heavy_check_mark:                                                                                                             | N/A                                                                                                                            |