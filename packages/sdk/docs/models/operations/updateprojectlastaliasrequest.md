# UpdateProjectLastAliasRequest

## Example Usage

```typescript
import { UpdateProjectLastAliasRequest } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectLastAliasRequest = {
  fromDeploymentId: "<id>",
  toDeploymentId: "<id>",
  jobStatus: "failed",
  requestedAt: 997.33,
  type: "promote",
};
```

## Fields

| Field                                                                                                              | Type                                                                                                               | Required                                                                                                           | Description                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `fromDeploymentId`                                                                                                 | *string*                                                                                                           | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |
| `toDeploymentId`                                                                                                   | *string*                                                                                                           | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |
| `jobStatus`                                                                                                        | [operations.UpdateProjectJobStatus](../../models/operations/updateprojectjobstatus.md)                             | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |
| `requestedAt`                                                                                                      | *number*                                                                                                           | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |
| `type`                                                                                                             | [operations.UpdateProjectProjectsResponse200Type](../../models/operations/updateprojectprojectsresponse200type.md) | :heavy_check_mark:                                                                                                 | N/A                                                                                                                |